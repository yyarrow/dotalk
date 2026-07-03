import type { SynthesizeResult } from "./types";

export async function synthesize(text: string): Promise<SynthesizeResult> {
  const apiKey = process.env.CARTESIA_API_KEY;
  const voiceId = process.env.CARTESIA_VOICE_ID;
  if (!apiKey) throw new Error("Missing CARTESIA_API_KEY");
  if (!voiceId) {
    throw new Error(
      "Missing CARTESIA_VOICE_ID — pick a voice id from your Cartesia voice library",
    );
  }

  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Cartesia-Version": "2026-03-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: process.env.CARTESIA_MODEL_ID || "sonic-3.5",
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", sample_rate: 44100 },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cartesia TTS failed (${res.status}): ${detail}`);
  }

  return { body: res.body, contentType: "audio/mpeg" };
}
