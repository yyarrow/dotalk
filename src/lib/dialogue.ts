import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { ProxyAgent, fetch as undiciFetch } from "undici";

// LLMs accessed through OpenRouter's OpenAI-compatible API.
const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  // Send a strict json_schema so generateObject's schema is actually
  // enforced; without this the model may omit fields and fail validation.
  supportsStructuredOutputs: true,
});

// Turn-by-turn conversation (spoken reply + coaching) is latency-critical:
// the user waits for this on every reply. deepseek-v4-flash has ~1s
// time-to-first-token (measured, on par with deepseek-chat) but is a newer
// v4-family model and ~4x cheaper on output — a straight upgrade for the
// live loop. Reasoning models (deepseek-v4-pro) are no faster here (the
// OpenRouter hop dominates) and cost more, so keep them off the hot path.
export const turnModel = openrouter(
  process.env.OPENROUTER_TURN_MODEL ?? "deepseek/deepseek-v4-flash",
);

// The end-of-session report is quality-critical and not latency-sensitive
// (it runs once, after the conversation), so it can use the heavier
// reasoning model for deeper analysis.
export const reportModel = openrouter(
  process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-pro",
);

// Audio-native observer (Gemini): understands mixed Chinese/English speech and
// gives pronunciation feedback from the raw audio. It runs in parallel and is
// not latency-critical. In restricted regions, local dev can route Google
// through GEMINI_PROXY; on Vercel the call originates server-side, so no proxy.
const geminiDispatcher = process.env.GEMINI_PROXY
  ? new ProxyAgent(process.env.GEMINI_PROXY)
  : undefined;

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  ...(geminiDispatcher
    ? {
        fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
          undiciFetch(input as string, {
            ...(init as Record<string, unknown>),
            dispatcher: geminiDispatcher,
          })) as unknown as typeof fetch,
      }
    : {}),
});

export const observerModel = google(
  process.env.GEMINI_MODEL ?? "gemini-3.1-flash",
);
