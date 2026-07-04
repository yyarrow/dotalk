import { generateObject } from "ai";
import { turnModel } from "@/lib/dialogue";
import { buildCoachPrompt } from "@/lib/prompts";
import {
  CoachingSchema,
  ScenarioConfigSchema,
  type TranscriptTurn,
} from "@/lib/schemas";

// Coaching feedback (grammar corrections + tone note) on the user's latest
// utterance. Called in parallel with /api/turn so it never blocks audio — the
// result is patched into the transcript as text once it arrives.
export async function POST(req: Request) {
  const body = await req.json();
  const scenario = ScenarioConfigSchema.parse(body.scenario);
  const history = (body.history ?? []) as TranscriptTurn[];
  const userMessage = String(body.userMessage ?? "");

  if (!userMessage.trim()) {
    return Response.json({ corrections: [] });
  }

  // Include the AI's previous line (if any) so tone feedback has context.
  const lastAssistant = [...history]
    .reverse()
    .find((t) => t.role === "assistant");
  const prompt = lastAssistant
    ? `AI 刚说：${lastAssistant.text}\n用户回答：${userMessage}`
    : `用户说：${userMessage}`;

  const { object } = await generateObject({
    model: turnModel,
    schema: CoachingSchema,
    system: buildCoachPrompt(scenario),
    prompt,
  });

  return Response.json(object);
}
