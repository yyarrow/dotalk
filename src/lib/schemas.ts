import { z } from "zod";

export const ScenarioModeSchema = z.enum(["workplace", "interview"]);
export type ScenarioMode = z.infer<typeof ScenarioModeSchema>;

// immersion: 面试官只懂英文，逼你憋出来（Deepgram Flux 自动轮次）。
// bilingual: 允许中文兜底，音频交给 Gemini 理解，用"按住说话"结束轮次。
export const AssistModeSchema = z.enum(["immersion", "bilingual"]);
export type AssistMode = z.infer<typeof AssistModeSchema>;

// Conversation-partner personality (label for display + prompt fragment to
// inject). Absent = default, no injection. See src/lib/personas.ts.
export const PersonaSchema = z.object({
  label: z.string(),
  prompt: z.string().min(1),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const ScenarioConfigSchema = z.object({
  mode: ScenarioModeSchema,
  assistMode: AssistModeSchema.default("immersion"),
  domainDescription: z
    .string()
    .min(1, "请描述一下场景，比如你的行业/岗位/这次要练什么"),
  persona: PersonaSchema.optional(),
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

// Coaching feedback on the user's latest utterance, computed in parallel with
// the spoken reply so it never blocks audio (it's shown as text, not spoken).
export const CoachingSchema = z.object({
  corrections: z
    .array(CorrectionSchema)
    .describe("这一轮用户表达里值得指出的语法/用词问题，没有就返回空数组"),
  toneNote: z
    .string()
    .optional()
    .describe("如果语气/得体度有明显问题（太直接、太生硬等）才填，否则不填"),
});
export type Coaching = z.infer<typeof CoachingSchema>;

// Audio-native observation of one user turn (Gemini). Understands mixed
// Chinese/English speech; adds pronunciation feedback the text-only coach
// can't give, plus an English rendering the interviewer can act on.
export const ObservationSchema = z.object({
  transcript: z
    .string()
    .describe("如实转写用户这段话；中英混说就原样保留中文和英文"),
  englishForInterviewer: z
    .string()
    .describe(
      "把这段话（含中文部分的意思）整理成通顺、地道、第一人称的英文，作为对话对象听到的内容用于推进对话",
    ),
  corrections: z
    .array(CorrectionSchema)
    .describe("针对用户说的英文的语法/用词/地道度问题，没有就空数组"),
  suggestedEnglish: z
    .string()
    .optional()
    .describe(
      "若用户有明显说不出、用中文顶替或卡壳的意思，给出地道的英文说法；全程英文流畅则不填",
    ),
  pronunciationNotes: z
    .string()
    .optional()
    .describe(
      "基于音频实际发音的口音/发音反馈（某个音、重音、连读等），定性描述，别编造；无明显问题则不填",
    ),
});
export type Observation = z.infer<typeof ObservationSchema>;

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
  // From the audio observer (bilingual mode / accent feedback):
  suggestedEnglish?: string;
  pronunciationNotes?: string;
}

// Targeted-training material generated from one session's transcript/report.
// phrases → vocabulary gaps; retries → re-answer a fumbled question; shadow →
// read a cleaned-up model answer aloud.
export const DrillPhraseSchema = z.object({
  target: z.string().describe("一个地道的英文表达/搭配/领域术语（用户这场缺的）"),
  meaning: z.string().describe("中文含义或使用场景，帮助理解什么时候用"),
  example: z.string().describe("用这个表达的一句地道英文例句（贴合用户的领域）"),
});

export const DrillRetrySchema = z.object({
  question: z.string().describe("面试官/对方这场问过、用户答得不好的问题（英文）"),
  skeleton: z
    .string()
    .describe("模范答法的骨架：一句话概括 + 分层要点，引导用户重新组织（英文要点为主）"),
});

export const DrillShadowSchema = z.object({
  model: z.string().describe("把用户某段磕巴/碎片化的回答改写成的干净、地道的模范答案（英文，可朗读跟读）"),
  focus: z.string().describe("这段重点练什么，中文一句，比如'减少 filler'、'先总后分'"),
});

export const DrillSetSchema = z.object({
  phrases: z.array(DrillPhraseSchema).describe("5-8 个最该掌握的表达"),
  retries: z.array(DrillRetrySchema).describe("2-3 个值得重答的问题"),
  shadow: z.array(DrillShadowSchema).describe("2-3 段可跟读的模范答案"),
});
export type DrillSet = z.infer<typeof DrillSetSchema>;

export interface SessionHistoryEntry {
  id: string;
  createdAt: string;
  scenario: ScenarioConfig;
  transcript: TranscriptTurn[];
  // Saved as null the moment a session ends; filled in once the report is
  // generated. Kept nullable so the transcript survives a failed report.
  report: SessionReport | null;
}
