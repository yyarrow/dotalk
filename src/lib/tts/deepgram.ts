import { DeepgramClient } from "@deepgram/sdk";
import type { SynthesizeResult } from "./types";

// Reuses the same Deepgram account/key already used for Flux STT.
export async function synthesize(text: string): Promise<SynthesizeResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("Missing DEEPGRAM_API_KEY");
  const model = process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";

  const client = new DeepgramClient({ apiKey });
  const response = await client.speak.v1.audio.generate({
    text,
    model,
    encoding: "mp3",
  });

  const body = response.stream();
  if (!body) throw new Error("Deepgram TTS returned no audio stream");
  return { body, contentType: "audio/mpeg" };
}
