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

// Chrome/Edge/Safari support streaming MP3 into an <audio> via MediaSource, so
// playback can begin on the first buffered bytes (~TTS time-to-first-byte)
// instead of waiting for the whole clip to synthesize. Where it's unavailable
// we fall back to a fully-buffered blob. Detected once at module load.
const CAN_STREAM_MP3 =
  typeof window !== "undefined" &&
  "MediaSource" in window &&
  MediaSource.isTypeSupported("audio/mpeg");

// Streams the assistant reply from /api/turn and speaks it sentence-by-sentence
// via /api/tts. Each sentence starts synthesizing as soon as it's complete, but
// playback is serialized — so the user hears sentence 1 (streaming in) while
// sentence 2 is already being synthesized. Resolves with the full reply once all
// audio has finished playing. Cancelable via `signal`.
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
    // Kick off synthesis immediately (this is what pipelines sentence N+1's
    // synthesis under sentence N's playback); play() is chained so audio stays
    // in order.
    const player = createPlayer(sentence, signal);
    playChain = playChain.then(() =>
      player.play(signal, () => {
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

interface Player {
  // Plays the (possibly still-streaming) audio to completion. onStart fires the
  // moment playback actually begins.
  play(signal: AbortSignal, onStart: () => void): Promise<void>;
}

// Begins synthesizing `text` right away and returns a Player. In streaming mode
// the audio buffers into a MediaSource as it arrives even before play() is
// called, so the next sentence keeps synthesizing while this one waits its turn.
function createPlayer(text: string, signal: AbortSignal): Player {
  const request = fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!CAN_STREAM_MP3) {
    const urlReady = request
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("语音合成失败"))))
      .then((blob) => URL.createObjectURL(blob));
    return {
      play: (sig, onStart) =>
        urlReady.then((url) => playElement(new Audio(url), url, sig, onStart)),
    };
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const audio = new Audio(objectUrl);

  const buffered = new Promise<void>((resolve, reject) => {
    mediaSource.addEventListener(
      "sourceopen",
      async () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
          const response = await request;
          if (!response.ok || !response.body)
            throw new Error("语音合成失败");
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            await appendChunk(sourceBuffer, value);
          }
          if (mediaSource.readyState === "open") mediaSource.endOfStream();
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      { once: true },
    );
  });
  // Surfacing happens through play() (which races this); swallow here so a
  // synthesis failure on a not-yet-played sentence isn't an unhandled rejection.
  buffered.catch(() => {});

  return {
    play: (sig, onStart) => playElement(audio, objectUrl, sig, onStart, buffered),
  };
}

function appendChunk(
  sourceBuffer: SourceBuffer,
  chunk: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sourceBuffer.addEventListener("updateend", () => resolve(), { once: true });
    sourceBuffer.addEventListener(
      "error",
      () => reject(new Error("音频写入失败")),
      { once: true },
    );
    sourceBuffer.appendBuffer(chunk as BufferSource);
  });
}

function playElement(
  audio: HTMLAudioElement,
  objectUrl: string,
  signal: AbortSignal,
  onStart: () => void,
  buffered?: Promise<void>,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      URL.revokeObjectURL(objectUrl);
      return resolve();
    }
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      URL.revokeObjectURL(objectUrl);
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
    // If synthesis fails before there's anything playable, don't hang the chain.
    buffered?.catch(finish);
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
