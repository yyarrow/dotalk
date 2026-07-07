"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeepgramLive } from "@/lib/useDeepgramLive";
import { useMicRecorder } from "@/lib/useMicRecorder";
import {
  streamAndSpeak,
  observeTurn,
  fetchCoaching,
} from "@/lib/voiceTurn";
import type { ScenarioConfig, TranscriptTurn } from "@/lib/schemas";

type Status = "idle" | "listening" | "thinking" | "speaking";

function readScenario(): ScenarioConfig | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("dotalk:scenario");
  return raw ? (JSON.parse(raw) as ScenarioConfig) : null;
}

export default function PracticePage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioConfig | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const turnAbortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const immersionTurnRef = useRef<(t: string, a: Blob) => void>(() => {});

  const { start, stop, isListening } = useDeepgramLive();
  const recorder = useMicRecorder();

  const isBilingual = scenario?.assistMode === "bilingual";

  useEffect(() => {
    const stored = readScenario();
    if (!stored) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScenario(stored);
  }, [router]);

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

  // Immersion: Deepgram gives the English transcript (drives the reply) and the
  // turn's audio; the observer runs in parallel and never blocks the reply.
  const startListening = useCallback(() => {
    setStatus("listening");
    start({
      onTurn: (text, audio) => {
        setInterim("");
        immersionTurnRef.current(text, audio);
      },
      onInterimTranscript: setInterim,
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
  }, [start]);

  const handleImmersionTurn = useCallback(
    async (text: string, audio: Blob) => {
      if (!scenario) return;
      stop();
      const abort = new AbortController();
      turnAbortRef.current = abort;
      const history = transcriptRef.current;
      const userIndex = appendTurn({ role: "user", text });
      const assistantIndex = appendTurn({ role: "assistant", text: "" });

      // Parallel observer (accent + phrasing). Falls back to the text coach if
      // the observer is unavailable (e.g. no GEMINI_API_KEY), so coaching still
      // works without it. Never blocks the spoken reply.
      void observeTurn(scenario, audio, history, abort.signal).then(
        async (obs) => {
          if (obs) {
            patchTurnAt(userIndex, {
              corrections: obs.corrections,
              suggestedEnglish: obs.suggestedEnglish,
              pronunciationNotes: obs.pronunciationNotes,
            });
          } else {
            const coaching = await fetchCoaching(
              scenario,
              text,
              history,
              abort.signal,
            );
            if (coaching) {
              patchTurnAt(userIndex, {
                corrections: coaching.corrections,
                toneNote: coaching.toneNote,
              });
            }
          }
        },
      );

      try {
        setStatus("thinking");
        await streamAndSpeak({
          scenario,
          history,
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
    immersionTurnRef.current = handleImmersionTurn;
  }, [handleImmersionTurn]);

  // Bilingual: push-to-talk. The observer transcribes + renders English on the
  // critical path (the interviewer replies to that English), understanding
  // Chinese fallback. Slower per turn — the accepted cost of this mode.
  const handleBilingualTurn = useCallback(
    async (audio: Blob) => {
      if (!scenario) return;
      const abort = new AbortController();
      turnAbortRef.current = abort;
      const history = transcriptRef.current;
      const userIndex = appendTurn({ role: "user", text: "（识别中…）" });
      const assistantIndex = appendTurn({ role: "assistant", text: "" });

      try {
        setStatus("thinking");
        const obs = await observeTurn(scenario, audio, history, abort.signal);
        if (abort.signal.aborted) return;
        if (!obs) {
          setError("双语模式需要配置 GEMINI_API_KEY（音频理解）才能用");
          patchTurnAt(userIndex, { text: "（识别失败）" });
          setStatus("idle");
          return;
        }
        patchTurnAt(userIndex, {
          text: obs.transcript,
          corrections: obs.corrections,
          suggestedEnglish: obs.suggestedEnglish,
          pronunciationNotes: obs.pronunciationNotes,
        });
        await streamAndSpeak({
          scenario,
          history,
          userMessage: obs.englishForInterviewer,
          onText: (partial) => patchTurnAt(assistantIndex, { text: partial }),
          onSpeakingStart: () => setStatus("speaking"),
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        setStatus("idle");
      } catch (e) {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("idle");
      }
    },
    [scenario, appendTurn, patchTurnAt],
  );

  const busy = status === "thinking" || status === "speaking";

  const startTalking = useCallback(() => {
    if (busy || recorder.recording) return;
    setError("");
    setStatus("listening");
    void recorder.start();
  }, [busy, recorder]);

  const stopTalking = useCallback(async () => {
    if (!recorder.recording) return;
    const audio = await recorder.stop();
    void handleBilingualTurn(audio);
  }, [recorder, handleBilingualTurn]);

  // Kick off: the AI speaks first, then we hand control to the right input mode.
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
        if (scenario.assistMode === "bilingual") setStatus("idle");
        else startListening();
      } catch (e) {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("idle");
      }
    })();
  }, [scenario, appendTurn, patchTurnAt, startListening]);

  useEffect(() => () => turnAbortRef.current?.abort(), []);

  const handleEnd = () => {
    turnAbortRef.current?.abort();
    stop();
    sessionStorage.setItem(
      "dotalk:transcript",
      JSON.stringify(transcriptRef.current),
    );
    router.push("/report");
  };

  if (!scenario) return null;

  const userTurnsWithFeedback = transcript
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t }) =>
        t.role === "user" &&
        (t.suggestedEnglish ||
          (t.corrections && t.corrections.length > 0) ||
          t.pronunciationNotes ||
          t.toneNote),
    );

  const statusLabel: Record<Status, string> = {
    idle: isBilingual ? "按住下方按钮说话" : "准备中…",
    listening: recorder.recording ? "录音中…松开结束" : "在听你说…",
    thinking: "AI 思考中…",
    speaking: "AI 说话中…",
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">
            {scenario.mode === "interview" ? "模拟面试" : "职场协作练习"}
          </h1>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
            {isBilingual ? "双语兜底" : "沉浸模式"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleEnd}
          className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
        >
          结束练习
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden md:flex-row">
        {/* Conversation */}
        <section className="flex-1 space-y-3 overflow-y-auto">
          {transcript.map((turn, i) => (
            <div
              key={i}
              className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  turn.role === "user"
                    ? "bg-black text-white"
                    : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {turn.text || "…"}
              </div>
            </div>
          ))}
          {interim && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-neutral-50 px-4 py-2 text-sm text-neutral-400">
                {interim}
              </div>
            </div>
          )}
        </section>

        {/* Observer panel */}
        <aside className="overflow-y-auto md:w-80 md:border-l md:border-neutral-100 md:pl-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            观察者反馈
          </h2>
          {userTurnsWithFeedback.length === 0 ? (
            <p className="text-xs text-neutral-400">
              说话后，这里会实时给出：该怎么用英文说、语法/用词纠正、发音口音点评。
            </p>
          ) : (
            <div className="space-y-3">
              {userTurnsWithFeedback.map(({ t, i }) => (
                <div
                  key={i}
                  className="rounded-xl border border-neutral-100 p-3 text-xs"
                >
                  {t.suggestedEnglish && (
                    <p className="mb-1.5 rounded-lg bg-blue-50 px-2 py-1.5 text-blue-800">
                      💡 更地道的说法：{t.suggestedEnglish}
                    </p>
                  )}
                  {t.corrections?.map((c, ci) => (
                    <p key={ci} className="mb-1 text-amber-800">
                      <span className="line-through">{c.original}</span>
                      {" → "}
                      <span className="font-medium">{c.suggestion}</span>
                      <span className="text-amber-600">（{c.reason}）</span>
                    </p>
                  ))}
                  {t.pronunciationNotes && (
                    <p className="mb-1 text-neutral-500">
                      🔊 {t.pronunciationNotes}
                    </p>
                  )}
                  {t.toneNote && (
                    <p className="text-neutral-500">💬 {t.toneNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 border-t border-neutral-100 pt-4">
        {isBilingual ? (
          <button
            type="button"
            disabled={busy}
            onPointerDown={startTalking}
            onPointerUp={stopTalking}
            onPointerLeave={stopTalking}
            className={`rounded-full px-8 py-3 text-sm font-medium text-white transition disabled:opacity-40 ${
              recorder.recording ? "bg-red-500" : "bg-black"
            }`}
          >
            {recorder.recording ? "松开结束" : "按住说话"}
          </button>
        ) : (
          <>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isListening
                  ? "bg-green-500"
                  : status === "speaking"
                    ? "bg-blue-500"
                    : "bg-neutral-300"
              }`}
            />
            <span className="text-sm text-neutral-500">{statusLabel[status]}</span>
          </>
        )}
      </div>
      {isBilingual && (
        <p className="text-center text-xs text-neutral-400">{statusLabel[status]}</p>
      )}
    </main>
  );
}
