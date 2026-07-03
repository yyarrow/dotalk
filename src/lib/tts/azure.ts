import type { SynthesizeResult } from "./types";

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Cheapest of the three providers we compared, with a free monthly
// allowance — the default for cost-sensitive early usage. Uses the
// subscription-key header directly (no separate token exchange step).
export async function synthesize(text: string): Promise<SynthesizeResult> {
  const region = process.env.AZURE_SPEECH_REGION;
  const key = process.env.AZURE_SPEECH_KEY;
  const voice = process.env.AZURE_TTS_VOICE || "en-US-JennyNeural";
  if (!region || !key) {
    throw new Error("Missing AZURE_SPEECH_REGION or AZURE_SPEECH_KEY");
  }

  const ssml = `<speak version="1.0" xml:lang="en-US"><voice xml:lang="en-US" name="${voice}">${escapeSsml(text)}</voice></speak>`;

  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-64kbitrate-mono-mp3",
        "User-Agent": "DoTalk",
      },
      body: ssml,
    },
  );

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure TTS failed (${res.status}): ${detail}`);
  }

  return { body: res.body, contentType: "audio/mpeg" };
}
