"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadHistoryEntry, setHistoryDrills } from "@/lib/history";
import { addToDeck } from "@/lib/deck";
import type { DrillSet, SessionHistoryEntry } from "@/lib/schemas";

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
    // best-effort playback
  }
}

function PlayButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 hover:border-neutral-400 hover:text-black"
      title="朗读"
    >
      🔊 朗读
    </button>
  );
}

export default function TrainPage() {
  const [entry, setEntry] = useState<SessionHistoryEntry | null>(null);
  const [drills, setDrills] = useState<DrillSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Generates drills for an entry and caches them on the history record so a
  // later visit reuses the result instead of re-calling the reasoning model.
  const generate = useCallback(async (target: SessionHistoryEntry) => {
    setLoading(true);
    setError("");
    setDrills(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: target.scenario,
          transcript: target.transcript,
        }),
      });
      if (!res.ok) throw new Error("训练材料生成失败，稍后再试");
      const data = (await res.json()) as DrillSet;
      setDrills(data);
      setHistoryDrills(target.id, data);
      addToDeck(data.phrases); // feed the spaced-repetition review deck
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    const found = id ? loadHistoryEntry(id) : null;
    if (!found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("找不到这次练习记录，回历史记录里点「针对性训练」进来。");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntry(found);
    // Reuse cached drills if we already generated them for this session.
    if (found.drills) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDrills(found.drills);
      addToDeck(found.drills.phrases); // idempotent (deduped by target)
    } else {
      void generate(found);
    }
  }, [generate]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-700"
          >
            ← 主页
          </Link>
          <h1 className="mt-2 text-xl font-semibold">针对性训练</h1>
          {entry && (
            <p className="mt-1 text-xs text-neutral-400">
              基于：
              {entry.scenario.mode === "interview" ? "面试" : "职场协作"} ·{" "}
              {entry.scenario.domainDescription.slice(0, 40)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {drills && entry && (
            <button
              type="button"
              onClick={() => generate(entry)}
              disabled={loading}
              className="rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            >
              重新生成
            </button>
          )}
          <Link
            href="/history"
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            历史记录
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && (
        <p className="text-sm text-neutral-400">
          正在根据这次练习生成针对性训练…（用的是较慢的模型，稍等）
        </p>
      )}

      {drills && (
        <div className="flex flex-col gap-8">
          {/* Vocabulary / expressions */}
          <section>
            <h2 className="mb-1 text-sm font-semibold">该掌握的表达</h2>
            <p className="mb-3 text-xs text-neutral-400">
              这些是你这次想说却没说出来 / 说得不地道的地方。看例句，练到能脱口而出。
            </p>
            <div className="space-y-3">
              {drills.phrases.map((p, i) => (
                <div key={i} className="rounded-xl border border-neutral-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{p.target}</p>
                    <PlayButton text={p.example} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{p.meaning}</p>
                  <p className="mt-1.5 text-sm text-neutral-700">e.g. {p.example}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Re-answer the fumbled questions */}
          <section>
            <h2 className="mb-1 text-sm font-semibold">重答这些问题</h2>
            <p className="mb-3 text-xs text-neutral-400">
              你这几题答得散。照骨架先在脑子里组织好，再开口重答一遍。
            </p>
            <div className="space-y-3">
              {drills.retries.map((r, i) => (
                <div key={i} className="rounded-xl border border-neutral-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">Q: {r.question}</p>
                    <PlayButton text={r.question} />
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">
                    {r.skeleton}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Shadow the model answers */}
          <section>
            <h2 className="mb-1 text-sm font-semibold">跟读模范答案</h2>
            <p className="mb-3 text-xs text-neutral-400">
              把你磕巴的回答改写干净了。点朗读跟着读，练流利、减少 filler。
            </p>
            <div className="space-y-3">
              {drills.shadow.map((s, i) => (
                <div key={i} className="rounded-xl border border-neutral-200 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-700">🎯 {s.focus}</span>
                    <PlayButton text={s.model} />
                  </div>
                  <p className="text-sm text-neutral-800">{s.model}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
