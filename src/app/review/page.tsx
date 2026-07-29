"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dueItems, gradeItem, type DeckItem } from "@/lib/deck";

async function speak(text: string) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), {
      once: true,
    });
    await audio.play();
  } catch {
    // best-effort
  }
}

export default function ReviewPage() {
  // Snapshot the due queue once at mount so grading (which reschedules items)
  // doesn't reshuffle the list mid-session.
  const [queue, setQueue] = useState<DeckItem[]>([]);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue(dueItems());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  const current = queue[index];

  const grade = (remembered: boolean) => {
    if (!current) return;
    gradeItem(current.id, remembered);
    setReviewed((n) => n + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  const done = ready && index >= queue.length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-700">
            ← 主页
          </Link>
          <h1 className="mt-2 text-xl font-semibold">每日复习</h1>
          <p className="mt-1 text-xs text-neutral-400">
            间隔重复：先自己回忆着说出来，再对答案。
          </p>
        </div>
        {ready && queue.length > 0 && !done && (
          <span className="text-sm text-neutral-400">
            {index + 1} / {queue.length}
          </span>
        )}
      </div>

      {ready && queue.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 p-6 text-center">
          <p className="text-sm text-neutral-600">今天没有要复习的 ✅</p>
          <p className="mt-1 text-xs text-neutral-400">
            去练习、生成针对性训练，表达会自动进这里排期复习。
          </p>
          <Link
            href="/new"
            className="mt-4 inline-block rounded-full bg-black px-4 py-1.5 text-sm text-white"
          >
            去练习
          </Link>
        </div>
      )}

      {done && queue.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 p-6 text-center">
          <p className="text-sm text-neutral-600">
            今天复习完了 🎉 复习了 {reviewed} 个。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-black px-4 py-1.5 text-sm text-white"
          >
            回主页
          </Link>
        </div>
      )}

      {current && !done && (
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 p-6">
          <div>
            <p className="text-xs text-neutral-400">用英文怎么说 / 什么场景</p>
            <p className="mt-1 text-lg">{current.meaning}</p>
          </div>

          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="self-start rounded-full bg-black px-4 py-2 text-sm text-white"
            >
              先说出来，再看答案
            </button>
          ) : (
            <>
              <div className="rounded-xl bg-neutral-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-medium">{current.target}</p>
                  <button
                    type="button"
                    onClick={() => speak(current.example)}
                    className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 hover:text-black"
                  >
                    🔊 朗读
                  </button>
                </div>
                <p className="mt-1.5 text-sm text-neutral-700">e.g. {current.example}</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => grade(false)}
                  className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
                >
                  不记得
                </button>
                <button
                  type="button"
                  onClick={() => grade(true)}
                  className="flex-1 rounded-lg bg-black py-2 text-sm text-white"
                >
                  记得
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
