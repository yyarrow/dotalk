"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeepgramLive } from "@/lib/useDeepgramLive";
import type { ScenarioConfig, TranscriptTurn, TurnResponse } from "@/lib/schemas";

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
  const [scenario] = useState<ScenarioConfig | null>(() => readScenario());
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const handleUserTurnRef = useRef<(text: string) => void>(() => {});

  const { start, stop, isListening } = useDeepgramLive();

  useEffect(() => {
    if (!scenario) router.replace("/");
  }, [scenario, router]);

  const appendTurn = useCallback((turn: TranscriptTurn) => {
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
  }, []);

  const patchLastTurn = useCallback((patch: Partial<TranscriptTurn>) => {
    const next = [...transcriptRef.current];
    next[next.length - 1] = { ...next[next.length - 1], ...patch };
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

  const requestTurn = useCallback(
    async (userMessage: string, history: TranscriptTurn[]) => {
      if (!scenario) return null;
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, history, userMessage }),
      });
      if (!res.ok) throw new Error("对话生成失败，稍后重试");
      return (await res.json()) as TurnResponse;
    },
    [scenario],
  );

  const playReply = useCallback(async (text: string) => {
    setStatus("speaking");
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("语音合成失败");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    await new Promise<void>((resolve) => {
      audio.addEventListener("ended", () => resolve(), { once: true });
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
  }, []);

  const handleUserTurn = useCallback(
    async (text: string) => {
      stop();
      setStatus("thinking");
      const historySnapshot = transcriptRef.current;
      appendTurn({ role: "user", text });
      try {
        const turnResponse = await requestTurn(text, historySnapshot);
        if (!turnResponse) return;
        patchLastTurn({
          corrections: turnResponse.corrections,
          toneNote: turnResponse.toneNote,
        });
        appendTurn({ role: "assistant", text: turnResponse.reply });
        await playReply(turnResponse.reply);
        setStatus("listening");
        start({
          onFinalTranscript: (t) => {
            setInterim("");
            handleUserTurnRef.current(t);
          },
          onInterimTranscript: setInterim,
          onError: (e) => setError(e instanceof Error ? e.message : String(e)),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("idle");
      }
    },
    [stop, start, appendTurn, patchLastTurn, requestTurn, playReply],
  );

  useEffect(() => {
    handleUserTurnRef.current = handleUserTurn;
  }, [handleUserTurn]);

  useEffect(() => {
    if (!scenario || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      setStatus("thinking");
      try {
        const turnResponse = await requestTurn("", []);
        if (!turnResponse) return;
        appendTurn({ role: "assistant", text: turnResponse.reply });
        await playReply(turnResponse.reply);
        setStatus("listening");
        start({
          onFinalTranscript: (t) => {
            setInterim("");
            handleUserTurnRef.current(t);
          },
          onInterimTranscript: setInterim,
          onError: (e) => setError(e instanceof Error ? e.message : String(e)),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("idle");
      }
    })();
  }, [scenario, requestTurn, appendTurn, playReply, start]);

  const handleEnd = () => {
    stop();
    audioRef.current?.pause();
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
