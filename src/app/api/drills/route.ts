import { generateObject } from "ai";
import { reportModel } from "@/lib/dialogue";
import { buildDrillsPrompt } from "@/lib/prompts";
import {
  DrillSetSchema,
  ScenarioConfigSchema,
  type TranscriptTurn,
} from "@/lib/schemas";

// Generates targeted-training material (phrases / retries / shadow) from one
// session. Quality-over-latency, like the report — uses the reasoning model.
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const scenario = ScenarioConfigSchema.parse(body.scenario);
  const transcript = (body.transcript ?? []) as TranscriptTurn[];

  // Serialize each turn, folding in the coach's per-turn annotations so the
  // model can target the exact spots the user struggled with.
  const transcriptText = transcript
    .map((turn) => {
      const who = turn.role === "user" ? "用户" : "AI";
      const notes: string[] = [];
      if (turn.corrections?.length) {
        notes.push(
          "纠错: " +
            turn.corrections
              .map((c) => `${c.original}→${c.suggestion}`)
              .join("; "),
        );
      }
      if (turn.suggestedEnglish) notes.push("更地道: " + turn.suggestedEnglish);
      if (turn.pronunciationNotes) notes.push("发音: " + turn.pronunciationNotes);
      return `${who}: ${turn.text}${notes.length ? `\n  [${notes.join(" | ")}]` : ""}`;
    })
    .join("\n");

  const { object } = await generateObject({
    model: reportModel,
    schema: DrillSetSchema,
    system: buildDrillsPrompt(scenario),
    prompt: transcriptText || "（本次没有产生任何对话）",
  });

  return Response.json(object);
}
