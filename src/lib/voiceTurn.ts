"use client";

import type {
  Coaching,
  Observation,
  ScenarioConfig,
  TranscriptTurn,
} from "./schemas";

interface StreamAndSpeakOpts {
  scenario: ScenarioConfig;
  history: TranscriptTurn[];
  userMessage: string;
  onText: (partialReply: string) => void;
  onSpeakingStart?: () => void;
  signal: AbortSignal;
}

// If playback never actually starts within this window (autoplay blocked with
// no rejection, decode stall, a tab that won't load media, etc.), give up on
// that clip so the turn can't hang forever with the mic disabled.
const PLAYBACK_START_TIMEOUT_MS = 6000;

// Streams the assistant reply from /api/turn and speaks it sentence-by-sentence
// via /api/tts. Each sentence starts synthesizing as soon as it's complete
// (so sentence N+1 is fetched while sentence N plays), but playback is
// serialized so audio stays in order. Resolves with the full reply once all
// audio has finished. Cancelable via `signal`.
export async function streamAndSpeak({
  scenario,
  history,
  userMessage,
  onText,
  onSpeakingStart,
  signal,
}: StreamAndSpeakOpts): Promise<string> {
  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, history, userMessage }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("对话生成失败");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ""; // unflushed tail used only for sentence splitting
  let fullReply = ""; // everything received so far, for display
  let playChain: Promise<void> = Promise.resolve();
  let speakingStarted = false;

  const speak = (raw: string) => {
    const sentence = raw.trim();
    if (!sentence) return;
    // Kick off synthesis immediately (this pipelines sentence N+1's synthesis
    // under sentence N's playback); playback is chained to stay in order.
    const urlReady = fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sentence }),
      signal,
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("语音合成失败"))))
      .then((blob) => URL.createObjectURL(blob));

    playChain = playChain
      .then(() => urlReady)
      .then((url) =>
        playAudio(url, signal, () => {
          if (!speakingStarted) {
            speakingStarted = true;
            onSpeakingStart?.();
          }
        }),
      )
      // A synthesis/playback failure on one sentence must not abort the rest.
      .catch(() => {});
  };

  // Pull every complete sentence out of the buffer and hand it to speak();
  // leave any trailing partial sentence in the buffer for the next chunk.
  const flushSentences = (final: boolean) => {
    const re = /[^.!?]*[.!?]+/g;
    let consumed = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(buffer)) !== null) {
      speak(m[0]);
      consumed = re.lastIndex;
    }
    buffer = buffer.slice(consumed);
    if (final && buffer.trim()) {
      speak(buffer);
      buffer = "";
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      fullReply += chunk;
      onText(fullReply);
      flushSentences(false);
    }
    flushSentences(true);
    await playChain;
  } catch (e) {
    if (signal.aborted) return fullReply;
    throw e;
  }
  return fullReply;
}

// Plays one fully-downloaded audio clip to completion. Resolves on natural end,
// playback error, abort, or a start-timeout watchdog — never hangs.
function playAudio(
  url: string,
  signal: AbortSignal,
  onStart: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      URL.revokeObjectURL(url);
      return resolve();
    }
    const audio = new Audio(url);
    let settled = false;
    let startGuard: ReturnType<typeof setTimeout>;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(startGuard);
      signal.removeEventListener("abort", finish);
      audio.pause();
      URL.revokeObjectURL(url);
      resolve();
    };

    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    // Once real playback begins we trust "ended"; until then, guard against a
    // clip that never starts.
    audio.addEventListener(
      "playing",
      () => clearTimeout(startGuard),
      { once: true },
    );
    signal.addEventListener("abort", finish, { once: true });

    startGuard = setTimeout(finish, PLAYBACK_START_TIMEOUT_MS);
    onStart();
    audio.play().catch(finish);
  });
}

// Sends a turn's raw audio to the Gemini observer. Returns a faithful
// transcript, an English rendering the interviewer can act on (bilingual mode),
// grammar corrections, a suggested English phrasing for anything said in
// Chinese, and pronunciation notes. Returns null on failure/cancel so callers
// can fall back (e.g. to the text coach) without breaking the flow.
export async function observeTurn(
  scenario: ScenarioConfig,
  audio: Blob,
  history: TranscriptTurn[],
  signal: AbortSignal,
): Promise<Observation | null> {
  try {
    const form = new FormData();
    form.append("audio", audio, "turn.wav");
    form.append("scenario", JSON.stringify(scenario));
    form.append("history", JSON.stringify(history));
    const res = await fetch("/api/observe", {
      method: "POST",
      body: form,
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Observation;
  } catch {
    return null;
  }
}

// Fetches coaching feedback for the user's latest utterance in parallel with
// the spoken reply. Returns null on failure or cancellation (coaching is
// best-effort and must never break the conversation flow).
export async function fetchCoaching(
  scenario: ScenarioConfig,
  userMessage: string,
  history: TranscriptTurn[],
  signal: AbortSignal,
): Promise<Coaching | null> {
  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, userMessage, history }),
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Coaching;
  } catch {
    return null;
  }
}
