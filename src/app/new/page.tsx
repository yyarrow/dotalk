"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PERSONAS } from "@/lib/personas";
import type { AssistMode, ScenarioConfig, ScenarioMode } from "@/lib/schemas";

interface JdEntry {
  id: string;
  title: string;
  text: string;
}

const JD_HISTORY_KEY = "dotalk:jdHistory";

async function parseDocument(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/parse-document", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  const { text } = await res.json();
  return text as string;
}

export default function NewSessionPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ScenarioMode>("workplace");
  const [assistMode, setAssistMode] = useState<AssistMode>("immersion");
  const [personaId, setPersonaId] = useState("default");
  const [customPersona, setCustomPersona] = useState("");
  const [domainDescription, setDomainDescription] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [parsing, setParsing] = useState<"jd" | "resume" | null>(null);
  const [error, setError] = useState("");
  const [jdHistory, setJdHistory] = useState<JdEntry[]>([]);

  // localStorage can't be read during SSR/render, so hydrate the saved-JD list
  // after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(JD_HISTORY_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setJdHistory(JSON.parse(raw) as JdEntry[]);
    } catch {
      // ignore malformed cache
    }
  }, []);

  const persistHistory = (next: JdEntry[]) => {
    setJdHistory(next);
    try {
      localStorage.setItem(JD_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore quota/availability errors
    }
  };

  // Remember every JD actually used, deduped by content, newest first, capped.
  const rememberJd = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const title = (t.split("\n").find((l) => l.trim()) ?? t).trim().slice(0, 40);
    const deduped = jdHistory.filter((i) => i.text.trim() !== t);
    persistHistory(
      [{ id: crypto.randomUUID(), title, text: t }, ...deduped].slice(0, 10),
    );
  };

  const deleteJd = (id: string) => {
    persistHistory(jdHistory.filter((i) => i.id !== id));
  };

  const handleFile = async (kind: "jd" | "resume", file: File | null) => {
    if (!file) return;
    setParsing(kind);
    setError("");
    try {
      const text = await parseDocument(file);
      if (kind === "jd") setJdText(text);
      else setResumeText(text);
    } catch {
      setError("文件解析失败，换个文件或者直接把内容粘贴到描述里");
    } finally {
      setParsing(null);
    }
  };

  const handleStart = () => {
    if (!domainDescription.trim()) {
      setError("先写一下这次练什么场景");
      return;
    }
    // Resolve the chosen persona: a custom one takes its text as the prompt;
    // a preset uses its prompt; "default" (empty prompt) injects nothing.
    let persona: ScenarioConfig["persona"];
    if (personaId === "custom") {
      const p = customPersona.trim();
      if (p) persona = { label: "自定义", prompt: p };
    } else {
      const preset = PERSONAS.find((x) => x.id === personaId);
      if (preset && preset.prompt) {
        persona = { label: preset.label, prompt: preset.prompt };
      }
    }

    const scenario: ScenarioConfig = {
      mode,
      assistMode,
      domainDescription: domainDescription.trim(),
      persona,
      jdText: jdText.trim() || undefined,
      resumeText: resumeText.trim() || undefined,
    };
    if (mode === "interview") rememberJd(jdText);
    sessionStorage.setItem("dotalk:scenario", JSON.stringify(scenario));
    router.push("/practice");
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-700">
          ← 主页
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">新练习</h1>
        <p className="mt-1 text-sm text-neutral-500">
          用英语练职场协作，或者练面试。场景自己写，也可以传JD和简历。
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            { value: "workplace", label: "职场协作" },
            { value: "interview", label: "面试" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === option.value
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">场景描述</span>
        <textarea
          value={domainDescription}
          onChange={(e) => setDomainDescription(e.target.value)}
          placeholder={
            mode === "workplace"
              ? "例如：我是一家跨境电商的后端工程师，下周要和美国产品经理开需求评审会，想练一下怎么委婉提出技术上的顾虑"
              : "例如：我要面试一家做支付的B2B SaaS公司的后端岗位，想重点练行为面试（behavioral interview）"
          }
          rows={4}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-black"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">语言模式</span>
        {(
          [
            {
              value: "immersion",
              label: "沉浸模式",
              hint: "对方只懂英文，逼你把话憋成英文说出来",
            },
            {
              value: "bilingual",
              label: "双语兜底",
              hint: "卡壳时可以说中文，按住说话；对方照样听懂并继续，右侧告诉你英文该怎么说",
            },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setAssistMode(option.value)}
            className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition ${
              assistMode === option.value
                ? "border-black bg-neutral-50"
                : "border-neutral-200 hover:border-neutral-400"
            }`}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-neutral-500">{option.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          对话对象风格<span className="text-neutral-400">（可选）</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPersonaId(p.id)}
              title={p.blurb}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                personaId === p.id
                  ? "border-black bg-neutral-50 font-medium"
                  : "border-neutral-200 text-neutral-600 hover:border-neutral-400"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPersonaId("custom")}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              personaId === "custom"
                ? "border-black bg-neutral-50 font-medium"
                : "border-neutral-200 text-neutral-600 hover:border-neutral-400"
            }`}
          >
            自定义
          </button>
        </div>
        {personaId === "custom" ? (
          <textarea
            value={customPersona}
            onChange={(e) => setCustomPersona(e.target.value)}
            placeholder="描述你想让对方是什么样的人/什么风格，比如：一个挑剔的支付行业 CTO，语气强势，专抠系统设计的边界条件"
            rows={2}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-black"
          />
        ) : (
          <p className="text-xs text-neutral-400">
            {PERSONAS.find((p) => p.id === personaId)?.blurb}
          </p>
        )}
      </div>

      {mode === "interview" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">JD（可选）</span>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="把职位描述整段粘贴进来（在 LinkedIn / 招聘页选中 → 复制 → 粘贴）。用过的会自动存到下面，下次点一下就行。"
              rows={4}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-black"
            />
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <label className="cursor-pointer hover:text-neutral-900">
                或上传文件（PDF/DOCX/TXT）
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => handleFile("jd", e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {parsing === "jd" && <span className="text-neutral-400">解析中…</span>}
              {jdText && parsing !== "jd" && (
                <span className="text-green-600">{jdText.length} 字</span>
              )}
            </div>

            {jdHistory.length > 0 && (
              <div className="mt-1 flex flex-col gap-1">
                <span className="text-xs text-neutral-400">历史 JD（点击复用）</span>
                <div className="flex flex-wrap gap-2">
                  {jdHistory.map((item) => (
                    <span
                      key={item.id}
                      className={`inline-flex items-center overflow-hidden rounded-full border text-xs ${
                        jdText.trim() === item.text.trim()
                          ? "border-black bg-neutral-50"
                          : "border-neutral-200"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setJdText(item.text)}
                        className="max-w-[16rem] truncate py-1 pl-3 pr-2 hover:text-black"
                        title={item.title}
                      >
                        {item.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteJd(item.id)}
                        className="px-2 py-1 text-neutral-400 hover:text-red-500"
                        title="删除"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">上传简历（可选）</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => handleFile("resume", e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {parsing === "resume" && (
              <span className="text-xs text-neutral-400">解析中…</span>
            )}
            {resumeText && !parsing && (
              <span className="text-xs text-green-600">已识别 {resumeText.length} 字</span>
            )}
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleStart}
        disabled={parsing !== null}
        className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        开始练习
      </button>
    </main>
  );
}
