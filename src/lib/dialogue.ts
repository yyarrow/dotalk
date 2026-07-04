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

// Turn-by-turn conversation is latency-critical: the user waits for this
// on every reply. A fast, non-reasoning chat model (deepseek-chat / a
// flash model) has ~1.7s time-to-first-token, vs ~5-8s for a reasoning
// model like deepseek-v4-pro — so default the live loop to the fast one.
export const turnModel = openrouter(
  process.env.OPENROUTER_TURN_MODEL ?? "deepseek/deepseek-chat",
);

// The end-of-session report is quality-critical and not latency-sensitive
// (it runs once, after the conversation), so it can use the heavier
// reasoning model for deeper analysis.
export const reportModel = openrouter(
  process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-pro",
);
