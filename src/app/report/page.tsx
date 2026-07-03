"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { saveHistoryEntry } from "@/lib/history";
import type { ScenarioConfig, SessionReport, TranscriptTurn } from "@/lib/schemas";

export default function ReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const scenarioRaw = sessionStorage.getItem("dotalk:scenario");
    const transcriptRaw = sessionStorage.getItem("dotalk:transcript");
    if (!scenarioRaw || !transcriptRaw) {
      router.replace("/");
      return;
    }
    const scenario = JSON.parse(scenarioRaw) as ScenarioConfig;
    const transcript = JSON.parse(transcriptRaw) as TranscriptTurn[];

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
        saveHistoryEntry({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          scenario,
          transcript,
          report: data,
        });
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

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!report && !error && <p className="text-sm text-neutral-400">生成报告中…</p>}
      {report && <ReportView report={report} />}
    </main>
  );
}
