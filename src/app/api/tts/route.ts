import { synthesizeSpeech } from "@/lib/tts";

// One-directional server -> client audio streaming: this fits Vercel's
// request/response + streaming model fine (unlike the STT leg, which
// needs a true duplex connection and therefore goes browser -> Deepgram
// directly). Whichever provider TTS_PROVIDER selects, its key never
// leaves the server.
export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return new Response("Missing 'text'", { status: 400 });
  }

  try {
    const { body, contentType } = await synthesizeSpeech(text);
    return new Response(body, { headers: { "Content-Type": contentType } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {
      status: 502,
    });
  }
}
