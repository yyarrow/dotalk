"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { loadHistory } from "@/lib/history";
import type { SessionHistoryEntry } from "@/lib/schemas";

export default function HistoryPage() {
  const router = useRouter();
  const [entries] = useState<SessionHistoryEntry[]>(() => loadHistory());
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">历史记录</h1>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-full bg-black px-3 py-1 text-sm text-white"
        >
          新练习
        </button>
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-neutral-400">还没有练习记录（记录只存在本地浏览器里）</p>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-neutral-200 p-4">
            <button
              type="button"
              onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-medium">
                  {entry.scenario.mode === "interview" ? "面试" : "职场协作"} ·{" "}
                  {entry.scenario.domainDescription.slice(0, 40)}
                </p>
                <p className="text-xs text-neutral-400">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="text-lg font-semibold">{entry.report.overallScore}</span>
            </button>
            {openId === entry.id && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <ReportView report={entry.report} />
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
