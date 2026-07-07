import { generateObject } from "ai";
import { observerModel } from "@/lib/dialogue";
import { buildObservePrompt } from "@/lib/prompts";
import {
  ObservationSchema,
  ScenarioConfigSchema,
  type TranscriptTurn,
} from "@/lib/schemas";

// Audio-native observer. Receives the raw WAV of one user turn (assembled
// browser-side from the same PCM the STT worklet produces) plus the scenario,
// and returns an Observation: a faithful transcript, an English rendering the
// interviewer can act on (bilingual mode), grammar corrections, a suggested
// English phrasing for anything said in Chinese, and pronunciation notes.
// Not latency-critical — it runs in parallel with the spoken reply.
export const maxDuration = 30;

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get("audio");
  const scenarioRaw = form.get("scenario");
  if (!(audio instanceof Blob) || typeof scenarioRaw !== "string") {
    return new Response("Missing audio or scenario", { status: 400 });
  }

  const scenario = ScenarioConfigSchema.parse(JSON.parse(scenarioRaw));
  const historyRaw = form.get("history");
  const history = (
    typeof historyRaw === "string" ? JSON.parse(historyRaw) : []
  ) as TranscriptTurn[];

  const bytes = new Uint8Array(await audio.arrayBuffer());
  const mediaType = audio.type || "audio/wav";

  const lastAssistant = [...history]
    .reverse()
    .find((t) => t.role === "assistant");
  const contextLine = lastAssistant
    ? `对话对象刚说：${lastAssistant.text}`
    : "这是对话的开场。";

  try {
    const { object } = await generateObject({
      model: observerModel,
      schema: ObservationSchema,
      system: buildObservePrompt(scenario),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: contextLine },
            { type: "file", mediaType, data: bytes },
          ],
        },
      ],
    });
    return Response.json(object);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {
      status: 502,
    });
  }
}
