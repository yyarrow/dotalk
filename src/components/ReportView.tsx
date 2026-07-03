import type { SessionReport } from "@/lib/schemas";

const STAR_KEYS = ["situation", "task", "action", "result"] as const;

export function ReportView({ report }: { report: SessionReport }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold">{report.overallScore}</span>
        <span className="text-sm text-neutral-400">/ 100</span>
      </div>
      <p className="text-sm text-neutral-700">{report.summary}</p>

      {report.strengths.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-800">做得好的地方</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
            {report.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {report.improvementAreas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-800">可以改进的地方</h2>
          <div className="space-y-3">
            {report.improvementAreas.map((area, i) => (
              <div key={i} className="rounded-lg bg-neutral-50 p-3 text-sm">
                <p className="font-medium text-neutral-800">{area.issue}</p>
                <p className="mt-1 text-neutral-500">例子：{area.example}</p>
                <p className="mt-1 text-neutral-700">建议：{area.suggestion}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-800">语气与职场得体度</h2>
        <p className="text-sm text-neutral-600">{report.toneAndProfessionalism}</p>
      </section>

      {report.starScore && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-800">STAR 结构评估</h2>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {STAR_KEYS.map((key) => (
              <div key={key} className="rounded-lg bg-neutral-50 py-2">
                <div className="text-lg font-semibold">{report.starScore![key]}</div>
                <div className="uppercase text-neutral-400">{key}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-neutral-600">{report.starScore.notes}</p>
        </section>
      )}
    </div>
  );
}
