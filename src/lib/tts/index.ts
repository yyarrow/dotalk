import { synthesize as synthesizeAzure } from "./azure";
import { synthesize as synthesizeElevenLabs } from "./elevenlabs";
import { synthesize as synthesizeDeepgram } from "./deepgram";
import { synthesize as synthesizeCartesia } from "./cartesia";
import type { SynthesizeResult } from "./types";

export type { SynthesizeResult } from "./types";

const PROVIDERS = {
  azure: synthesizeAzure,
  elevenlabs: synthesizeElevenLabs,
  deepgram: synthesizeDeepgram,
  cartesia: synthesizeCartesia,
} as const;

export type TTSProviderId = keyof typeof PROVIDERS;

// Switch providers with the TTS_PROVIDER env var, no code changes needed.
// Defaults to Azure: cheapest of the options we compared, with a free
// monthly allowance.
export function synthesizeSpeech(text: string): Promise<SynthesizeResult> {
  const provider = (process.env.TTS_PROVIDER || "azure") as TTSProviderId;
  const fn = PROVIDERS[provider];
  if (!fn) {
    throw new Error(
      `Unknown TTS_PROVIDER "${provider}" — expected one of: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return fn(text);
}
