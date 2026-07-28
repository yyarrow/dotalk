"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { saveHistoryEntry, setHistoryReport } from "@/lib/history";
import type { ScenarioConfig, SessionReport, TranscriptTurn } from "@/lib/schemas";

export default function ReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState("");
  // Guard against React's double-effect in dev, which would otherwise fire two
  // /api/report calls and save two history entries.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const scenarioRaw = sessionStorage.getItem("dotalk:scenario");
    const transcriptRaw = sessionStorage.getItem("dotalk:transcript");
    if (!scenarioRaw || !transcriptRaw) {
      router.replace("/");
      return;
    }
    const scenario = JSON.parse(scenarioRaw) as ScenarioConfig;
    const transcript = JSON.parse(transcriptRaw) as TranscriptTurn[];
    // Entry was already saved (transcript, report: null) when the session
    // ended; we fill in the report here. Fall back to creating one if we got
    // here without a session id (e.g. direct navigation).
    const sessionId = sessionStorage.getItem("dotalk:sessionId");

    (async () => {
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario, transcript }),
        });
        if (!res.ok) throw new Error("报告生成失败");
        const data = (await res.json()) as SessionReport;
        setReport(data);
        if (sessionId) {
          setHistoryReport(sessionId, data);
        } else {
          saveHistoryEntry({
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            scenario,
            transcript,
            report: data,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [router]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">练习报告</h1>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="rounded-full border border-neutral-300 px-3 py-1 text-neutral-600 hover:bg-neutral-100"
          >
            历史记录
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full bg-black px-3 py-1 text-white"
          >
            再练一次
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm">
          <p className="text-red-600">{error}</p>
          <p className="mt-1 text-neutral-500">
            这次的聊天记录已经存进历史了，没丢——可以到「历史记录」里查看原文。
          </p>
        </div>
      )}
      {!report && !error && <p className="text-sm text-neutral-400">生成报告中…</p>}
      {report && <ReportView report={report} />}
    </main>
  );
}
