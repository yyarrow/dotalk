import { streamText } from "ai";
import { turnModel } from "@/lib/dialogue";
import { buildReplyPrompt } from "@/lib/prompts";
import { ScenarioConfigSchema, type TranscriptTurn } from "@/lib/schemas";

// Streams the spoken reply as plain text so the client can start synthesizing
// and playing the first sentence while the rest is still being generated.
// Coaching feedback is a separate, parallel call (/api/coach) so it never
// blocks the audio path.
export async function POST(req: Request) {
  const body = await req.json();
  const scenario = ScenarioConfigSchema.parse(body.scenario);
  const history = (body.history ?? []) as TranscriptTurn[];
  const userMessage = String(body.userMessage ?? "");

  // Empty userMessage + empty history means "kick off the scenario" — there's
  // no trainee utterance yet, so swap in a stage direction.
  const latestContent =
    userMessage ||
    "(Begin the conversation now. Greet briefly in one sentence and immediately ask your first question, in character.)";

  const messages = [
    ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: "user" as const, content: latestContent },
  ];

  const result = streamText({
    model: turnModel,
    system: buildReplyPrompt(scenario),
    messages,
  });

  return result.toTextStreamResponse();
}
