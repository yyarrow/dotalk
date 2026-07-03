"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ScenarioConfig, ScenarioMode } from "@/lib/schemas";

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

export default function ScenarioBuilderPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ScenarioMode>("workplace");
  const [domainDescription, setDomainDescription] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [parsing, setParsing] = useState<"jd" | "resume" | null>(null);
  const [error, setError] = useState("");

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
    const scenario: ScenarioConfig = {
      mode,
      domainDescription: domainDescription.trim(),
      jdText: jdText.trim() || undefined,
      resumeText: resumeText.trim() || undefined,
    };
    sessionStorage.setItem("dotalk:scenario", JSON.stringify(scenario));
    router.push("/practice");
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">DoTalk</h1>
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

      {mode === "interview" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">上传 JD（可选）</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => handleFile("jd", e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {parsing === "jd" && (
              <span className="text-xs text-neutral-400">解析中…</span>
            )}
            {jdText && !parsing && (
              <span className="text-xs text-green-600">已识别 {jdText.length} 字</span>
            )}
          </label>
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
