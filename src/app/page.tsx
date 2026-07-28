"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadHistory } from "@/lib/history";
import type { SessionHistoryEntry } from "@/lib/schemas";

export default function HomePage() {
  const [recent, setRecent] = useState<SessionHistoryEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(loadHistory().slice(0, 3));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-14">
      <div>
        <h1 className="text-3xl font-semibold">DoTalk</h1>
        <p className="mt-2 text-sm text-neutral-500">
          用英语练职场协作和面试。开口说，边说边纠，练完给你结构化反馈。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/new"
          className="flex flex-col justify-between rounded-2xl bg-black p-5 text-white transition hover:opacity-90"
        >
          <span className="text-lg font-semibold">开始练习</span>
          <span className="mt-6 text-xs text-neutral-300">
            选场景 · 选风格 · 语音对话
          </span>
        </Link>
        <Link
          href="/history"
          className="flex flex-col justify-between rounded-2xl border border-neutral-200 p-5 transition hover:border-neutral-400"
        >
          <span className="text-lg font-semibold">历史记录</span>
          <span className="mt-6 text-xs text-neutral-500">
            回看对话原文和报告
          </span>
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">最近练习</span>
            <Link
              href="/history"
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              全部 →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {recent.map((entry) => (
              <Link
                key={entry.id}
                href="/history"
                className="flex items-center justify-between rounded-xl border border-neutral-100 px-4 py-3 transition hover:border-neutral-300"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {entry.scenario.mode === "interview" ? "面试" : "职场协作"} ·{" "}
                    {entry.scenario.domainDescription.slice(0, 40)}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="ml-3 shrink-0 text-sm font-semibold text-neutral-500">
                  {entry.report ? entry.report.overallScore : "—"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
