import { z } from "zod";

export const ScenarioModeSchema = z.enum(["workplace", "interview"]);
export type ScenarioMode = z.infer<typeof ScenarioModeSchema>;

export const ScenarioConfigSchema = z.object({
  mode: ScenarioModeSchema,
  domainDescription: z
    .string()
    .min(1, "请描述一下场景，比如你的行业/岗位/这次要练什么"),
  jdText: z.string().optional(),
  resumeText: z.string().optional(),
});
export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;

export const CorrectionSchema = z.object({
  original: z.string().describe("用户原话中有问题的片段"),
  suggestion: z.string().describe("更自然/更地道/更专业的表达"),
  reason: z.string().describe("为什么要这样改，一句话说清楚"),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const TurnResponseSchema = z.object({
  reply: z.string().describe("AI 作为对话对象接下来要说的话，会被朗读出来"),
  corrections: z
    .array(CorrectionSchema)
    .describe("这一轮用户表达里值得指出的语法/用词问题，没有就返回空数组"),
  toneNote: z
    .string()
    .optional()
    .describe("如果语气/得体度有明显问题（太直接、太生硬等）才填，否则不填"),
});
export type TurnResponse = z.infer<typeof TurnResponseSchema>;

export const ImprovementAreaSchema = z.object({
  issue: z.string().describe("反复出现的问题类型"),
  example: z.string().describe("对话里的具体例子"),
  suggestion: z.string().describe("具体怎么改"),
});

export const StarScoreSchema = z.object({
  situation: z.number().min(0).max(10),
  task: z.number().min(0).max(10),
  action: z.number().min(0).max(10),
  result: z.number().min(0).max(10),
  notes: z.string().describe("STAR 结构上的具体点评"),
});

export const SessionReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string().describe("整体表现的简要总结，2-3句话"),
  strengths: z.array(z.string()).describe("表现好的地方"),
  improvementAreas: z.array(ImprovementAreaSchema),
  toneAndProfessionalism: z.string().describe("语气和职场得体度点评"),
  starScore: StarScoreSchema.optional().describe(
    "仅面试场景下填写，按 STAR 法则评估回答结构",
  ),
});
export type SessionReport = z.infer<typeof SessionReportSchema>;

export interface TranscriptTurn {
  role: "user" | "assistant";
  text: string;
  corrections?: Correction[];
  toneNote?: string;
}

export interface SessionHistoryEntry {
  id: string;
  createdAt: string;
  scenario: ScenarioConfig;
  transcript: TranscriptTurn[];
  report: SessionReport;
}
