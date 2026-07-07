import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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

// The audio observer (mixed-language understanding + pronunciation feedback)
// calls OpenRouter directly from its route — see src/app/api/observe/route.ts.
