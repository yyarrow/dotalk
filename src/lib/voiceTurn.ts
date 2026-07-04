"use client";

import type { Coaching, ScenarioConfig, TranscriptTurn } from "./schemas";

interface StreamAndSpeakOpts {
  scenario: ScenarioConfig;
  history: TranscriptTurn[];
  userMessage: string;
  onText: (partialReply: string) => void;
  onSpeakingStart?: () => void;
  signal: AbortSignal;
}

// Streams the assistant reply from /api/turn and speaks it sentence-by-sentence
// via /api/tts. Each sentence's audio is fetched as soon as the sentence is
// complete, but playback is serialized — so the user hears sentence 1 while
// sentence 2 is still being generated and synthesized. Resolves with the full
// reply once all audio has finished playing. Cancelable via `signal`.
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
    const audioReady = fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sentence }),
      signal,
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("语音合成失败"))))
      .then((blob) => URL.createObjectURL(blob));

    playChain = playChain
      .then(() => audioReady)
      .then((url) =>
        playOne(url, signal, () => {
          if (!speakingStarted) {
            speakingStarted = true;
            onSpeakingStart?.();
          }
        }),
      );
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

function playOne(
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
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      URL.revokeObjectURL(url);
    };
    const onAbort = () => {
      audio.pause();
      cleanup();
      resolve();
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    onStart();
    audio.play().catch(finish);
  });
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
