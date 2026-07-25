import { ProxyAgent, fetch as undiciFetch } from "undici";
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
//
// We call OpenRouter directly (rather than through the AI SDK) with an
// OpenAI-style `input_audio` request.
//
// Region note: OpenRouter serves DeepSeek to the app's region but blocks Gemini
// there. `curl`/Node-with-proxy exit via an allowed region and work; a direct
// Node fetch is refused ("not available in your region"). So in local dev we
// route this one call through OPENROUTER_PROXY. On Vercel the server is already
// in an allowed region, so no proxy env is set and the call goes direct.
export const maxDuration = 30;

const OBSERVER_MODEL =
  process.env.OPENROUTER_OBSERVER_MODEL ?? "google/gemini-3.6-flash";

const proxyDispatcher = process.env.OPENROUTER_PROXY
  ? new ProxyAgent(process.env.OPENROUTER_PROXY)
  : undefined;

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

  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const lastAssistant = [...history]
    .reverse()
    .find((t) => t.role === "assistant");
  const contextLine = lastAssistant
    ? `对话对象刚说：${lastAssistant.text}`
    : "这是对话的开场。";

  const body = {
    model: OBSERVER_MODEL,
    messages: [
      { role: "system", content: buildObservePrompt(scenario) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${contextLine}\n\n只返回一个 JSON 对象，字段：transcript(string)、englishForInterviewer(string)、corrections(数组，每项含 original/suggestion/reason)、suggestedEnglish(string，可省略)、pronunciationNotes(string，可省略)。不要多余文字。`,
          },
          { type: "input_audio", input_audio: { data: base64, format: "wav" } },
        ],
      },
    ],
    response_format: { type: "json_object" as const },
  };

  try {
    const res = await undiciFetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
      },
    );
    if (!res.ok) {
      return new Response(await res.text(), { status: 502 });
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
    const observation = ObservationSchema.parse(JSON.parse(cleaned));
    return Response.json(observation);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {
      status: 502,
    });
  }
}
