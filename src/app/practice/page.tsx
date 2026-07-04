"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeepgramLive } from "@/lib/useDeepgramLive";
import { streamAndSpeak, fetchCoaching } from "@/lib/voiceTurn";
import type { ScenarioConfig, TranscriptTurn } from "@/lib/schemas";

type Status = "idle" | "listening" | "thinking" | "speaking";

const STATUS_LABEL: Record<Status, string> = {
  idle: "准备中…",
  listening: "在听你说…",
  thinking: "AI 思考中…",
  speaking: "AI 说话中…",
};

function readScenario(): ScenarioConfig | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("dotalk:scenario");
  return raw ? (JSON.parse(raw) as ScenarioConfig) : null;
}

export default function PracticePage() {
  const router = useRouter();
  // Start null on both server and client so the first client render matches
  // the SSR output; the sessionStorage read happens in an effect after mount
  // (reading it during render would desync SSR/client and break hydration).
  const [scenario, setScenario] = useState<ScenarioConfig | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const turnAbortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const handleUserTurnRef = useRef<(text: string) => void>(() => {});

  const { start, stop, isListening } = useDeepgramLive();

  useEffect(() => {
    const stored = readScenario();
    if (!stored) {
      router.replace("/");
      return;
    }
    // sessionStorage can't be read during SSR, so this post-mount setState is
    // the intended way to hydrate it without an SSR/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScenario(stored);
  }, [router]);

  // Appends a turn and returns the index it landed at, so callers can patch
  // that exact turn later (streamed reply text, or async coaching feedback).
  const appendTurn = useCallback((turn: TranscriptTurn): number => {
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
    return transcriptRef.current.length - 1;
  }, []);

  const patchTurnAt = useCallback(
    (index: number, patch: Partial<TranscriptTurn>) => {
      const next = [...transcriptRef.current];
      if (!next[index]) return;
      next[index] = { ...next[index], ...patch };
      transcriptRef.current = next;
      setTranscript(next);
    },
    [],
  );

  const startListening = useCallback(() => {
    setStatus("listening");
    start({
      onFinalTranscript: (t) => {
        setInterim("");
        handleUserTurnRef.current(t);
      },
      onInterimTranscript: setInterim,
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
  }, [start]);

  const handleUserTurn = useCallback(
    async (text: string) => {
      if (!scenario) return;
      stop();
      const abort = new AbortController();
      turnAbortRef.current = abort;
      const historySnapshot = transcriptRef.current;
      const userIndex = appendTurn({ role: "user", text });
      const assistantIndex = appendTurn({ role: "assistant", text: "" });

      // Coaching runs in parallel and patches the user turn when it returns —
      // it must never block the spoken reply.
      void fetchCoaching(scenario, text, historySnapshot, abort.signal).then(
        (coaching) => {
          if (coaching) {
            patchTurnAt(userIndex, {
              corrections: coaching.corrections,
              toneNote: coaching.toneNote,
            });
          }
        },
      );

      try {
        setStatus("thinking");
        await streamAndSpeak({
          scenario,
          history: historySnapshot,
          userMessage: text,
          onText: (partial) => patchTurnAt(assistantIndex, { text: partial }),
          onSpeakingStart: () => setStatus("speaking"),
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        startListening();
      } catch (e) {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("idle");
      }
    },
    [scenario, stop, appendTurn, patchTurnAt, startListening],
  );

  useEffect(() => {
    handleUserTurnRef.current = handleUserTurn;
  }, [handleUserTurn]);

  useEffect(() => {
    if (!scenario || startedRef.current) return;
    startedRef.current = true;
    const abort = new AbortController();
    turnAbortRef.current = abort;
    const assistantIndex = appendTurn({ role: "assistant", text: "" });
    (async () => {
      try {
        setStatus("thinking");
        await streamAndSpeak({
          scenario,
          history: [],
          userMessage: "",
          onText: (partial) => patchTurnAt(assistantIndex, { text: partial }),
          onSpeakingStart: () => setStatus("speaking"),
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        startListening();
      } catch (e) {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("idle");
      }
    })();
  }, [scenario, appendTurn, patchTurnAt, startListening]);

  // Stop any in-flight reply/audio if the user leaves the page.
  useEffect(() => () => turnAbortRef.current?.abort(), []);

  const handleEnd = () => {
    turnAbortRef.current?.abort();
    stop();
    sessionStorage.setItem("dotalk:transcript", JSON.stringify(transcriptRef.current));
    router.push("/report");
  };

  if (!scenario) return null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {scenario.mode === "interview" ? "模拟面试" : "职场协作练习"}
        </h1>
        <button
          type="button"
          onClick={handleEnd}
          className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
        >
          结束练习
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {transcript.map((turn, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 ${turn.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                turn.role === "user" ? "bg-black text-white" : "bg-neutral-100 text-neutral-900"
              }`}
            >
              {turn.text}
            </div>
            {turn.corrections && turn.corrections.length > 0 && (
              <div className="max-w-[85%] rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {turn.corrections.map((c, ci) => (
                  <p key={ci}>
                    <span className="line-through">{c.original}</span>
                    {" → "}
                    <span className="font-medium">{c.suggestion}</span>
                    <span className="text-amber-600">（{c.reason}）</span>
                  </p>
                ))}
              </div>
            )}
            {turn.toneNote && (
              <p className="max-w-[85%] text-xs text-neutral-400">💬 {turn.toneNote}</p>
            )}
          </div>
        ))}
        {interim && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl bg-neutral-50 px-4 py-2 text-sm text-neutral-400">
              {interim}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-center gap-3 border-t border-neutral-100 pt-4">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isListening
              ? "bg-green-500"
              : status === "speaking"
                ? "bg-blue-500"
                : "bg-neutral-300"
          }`}
        />
        <span className="text-sm text-neutral-500">{STATUS_LABEL[status]}</span>
      </div>
    </main>
  );
}
