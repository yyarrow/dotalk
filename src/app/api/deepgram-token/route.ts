import { DeepgramClient } from "@deepgram/sdk";

// Mints a short-lived JWT so the browser can open a Deepgram Flux
// WebSocket directly, without ever seeing the permanent API key.
// ttl_seconds covers one practice session; the client re-fetches a
// new token for each new session.
export async function GET() {
  const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
  const token = await client.auth.v1.tokens.grant({ ttl_seconds: 3600 });
  return Response.json(token);
}
