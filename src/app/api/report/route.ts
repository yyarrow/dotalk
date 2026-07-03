import { generateObject } from "ai";
import { dialogueModel } from "@/lib/deepseek";
import { buildReportPrompt } from "@/lib/prompts";
import {
  ScenarioConfigSchema,
  SessionReportSchema,
  type TranscriptTurn,
} from "@/lib/schemas";

export async function POST(req: Request) {
  const body = await req.json();
  const scenario = ScenarioConfigSchema.parse(body.scenario);
  const transcript = (body.transcript ?? []) as TranscriptTurn[];

  const transcriptText = transcript
    .map((turn) => `${turn.role === "user" ? "用户" : "AI"}: ${turn.text}`)
    .join("\n");

  const { object } = await generateObject({
    model: dialogueModel,
    schema: SessionReportSchema,
    system: buildReportPrompt(scenario),
    prompt: transcriptText || "（本次没有产生任何对话）",
  });

  return Response.json(object);
}
