import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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
// the user waits for this on every reply. Default is deepseek-v4.1-flash-1017
// ($0.15/M input, $0.60/M output on OpenRouter). Its latency and cost have NOT
// been re-measured for this variant; the ~1s time-to-first-token measured
// earlier was for deepseek-v4-flash. DeepSeek isn't region-blocked, so this
// stays on the direct provider (no proxy hop on the hot path).
export const turnModel = openrouter(
  process.env.OPENROUTER_TURN_MODEL ?? "deepseek/deepseek-v4.1-flash-1017",
);

// The reasoning tasks (session report + targeted-training drills) run once and
// aren't latency-critical. They use Gemini via OpenRouter, which OpenRouter
// blocks on a direct Node fetch from some regions — so in local dev this
// provider routes through OPENROUTER_PROXY. On Vercel the server is in an
// allowed region and no proxy env is set, so it goes direct.
const reasoningProxy = process.env.OPENROUTER_PROXY
  ? new ProxyAgent(process.env.OPENROUTER_PROXY)
  : undefined;

const openrouterReasoning = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  supportsStructuredOutputs: true,
  ...(reasoningProxy
    ? {
        fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
          undiciFetch(input as string, {
            ...(init as Record<string, unknown>),
            dispatcher: reasoningProxy,
          })) as unknown as typeof fetch,
      }
    : {}),
});

export const reportModel = openrouterReasoning(
  process.env.OPENROUTER_MODEL ?? "google/gemini-3.8-flash",
);

// The audio observer (mixed-language understanding + pronunciation feedback)
// calls OpenRouter directly from its route — see src/app/api/observe/route.ts.
