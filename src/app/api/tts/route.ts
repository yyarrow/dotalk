const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
const MODEL_ID = "eleven_flash_v2_5";

// One-directional server -> client audio streaming: this fits Vercel's
// request/response + streaming model fine (unlike the STT leg, which
// needs a true duplex connection and therefore goes browser -> Deepgram
// directly). The ElevenLabs API key never leaves the server.
export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return new Response("Missing 'text'", { status: 400 });
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`ElevenLabs TTS failed: ${detail}`, {
      status: upstream.status || 502,
    });
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
