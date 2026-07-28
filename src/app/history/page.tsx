"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReportView } from "@/components/ReportView";
import { deleteHistoryEntry, loadHistory } from "@/lib/history";
import type { SessionHistoryEntry } from "@/lib/schemas";

export default function HistoryPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<SessionHistoryEntry[]>(() =>
    loadHistory(),
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const remove = (id: string) => {
    deleteHistoryEntry(id);
    setEntries(loadHistory());
    if (openId === id) setOpenId(null);
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">历史记录</h1>
        <button
          type="button"
          onClick={() => router.push("/new")}
          className="rounded-full bg-black px-3 py-1 text-sm text-white"
        >
          新练习
        </button>
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-neutral-400">
          还没有练习记录（记录只存在本地浏览器里）
        </p>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
                className="flex flex-1 items-center justify-between text-left"
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
                <span className="text-lg font-semibold">
                  {entry.report ? (
                    entry.report.overallScore
                  ) : (
                    <span className="text-xs font-normal text-neutral-400">
                      无报告
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(entry.id)}
                className="rounded-full px-2 py-1 text-sm text-neutral-300 hover:text-red-500"
                title="删除这条记录"
              >
                ×
              </button>
            </div>

            {openId === entry.id && (
              <div className="mt-4 space-y-5 border-t border-neutral-100 pt-4">
                {/* The original conversation. */}
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-neutral-800">
                    对话原文
                  </h2>
                  <div className="space-y-2">
                    {entry.transcript.map((turn, i) => (
                      <div
                        key={i}
                        className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                            turn.role === "user"
                              ? "bg-black text-white"
                              : "bg-neutral-100 text-neutral-900"
                          }`}
                        >
                          {turn.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {entry.report ? (
                  <section>
                    <h2 className="mb-2 text-sm font-semibold text-neutral-800">
                      报告
                    </h2>
                    <ReportView report={entry.report} />
                  </section>
                ) : (
                  <p className="text-xs text-neutral-400">
                    这次没有生成报告（生成失败或被中断），但对话原文已保留。
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
