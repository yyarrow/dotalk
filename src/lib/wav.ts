// Wraps raw 16-bit PCM chunks (mono) in a WAV container. We use this instead of
// MediaRecorder because Gemini accepts audio/wav but not Chrome's default
// webm/opus — and we already have the PCM: it's exactly what the STT worklet
// emits (16kHz mono PCM16), so a turn's audio comes free from the same frames.
export function pcm16ToWavBlob(
  chunks: ArrayBuffer[],
  sampleRate = 16000,
): Blob {
  const dataBytes = chunks.reduce((n, c) => n + c.byteLength, 0);
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (const chunk of chunks) {
    new Uint8Array(buffer, offset, chunk.byteLength).set(new Uint8Array(chunk));
    offset += chunk.byteLength;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
