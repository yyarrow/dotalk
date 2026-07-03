import { generateObject } from "ai";
import { dialogueModel } from "@/lib/deepseek";
import { buildSystemPrompt } from "@/lib/prompts";
import {
  ScenarioConfigSchema,
  TurnResponseSchema,
  type TranscriptTurn,
} from "@/lib/schemas";

export async function POST(req: Request) {
  const body = await req.json();
  const scenario = ScenarioConfigSchema.parse(body.scenario);
  const history = (body.history ?? []) as TranscriptTurn[];
  const userMessage = String(body.userMessage ?? "");

  // Empty userMessage + empty history means "kick off the scenario" —
  // there's no real trainee utterance yet, so swap in a stage direction
  // instead of sending blank content to the model.
  const latestContent =
    userMessage ||
    "(Begin the conversation now. Greet naturally and kick off the scenario in character. Keep it brief.)";

  const messages = [
    ...history.map((turn) => ({
      role: turn.role,
      content: turn.text,
    })),
    { role: "user" as const, content: latestContent },
  ];

  const { object } = await generateObject({
    model: dialogueModel,
    schema: TurnResponseSchema,
    system: buildSystemPrompt(scenario),
    messages,
  });

  return Response.json(object);
}
