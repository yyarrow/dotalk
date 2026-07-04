import type { ScenarioConfig } from "./schemas";

function buildContext(scenario: ScenarioConfig): string {
  return [
    `场景描述（用户提供）：${scenario.domainDescription}`,
    scenario.jdText ? `职位描述 (JD)：\n${scenario.jdText}` : null,
    scenario.resumeText ? `候选人简历：\n${scenario.resumeText}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Prompt for the spoken reply only. The output is streamed and read aloud, so
// it must be plain English with no labels/JSON — coaching is a separate call.
export function buildReplyPrompt(scenario: ScenarioConfig): string {
  const roleInstruction =
    scenario.mode === "interview"
      ? "你扮演面试官。结合上面的 JD 和简历（如果有），提出贴合这个岗位的面试问题，追问细节，像真实面试官一样根据回答调整下一个问题。"
      : "你扮演用户在职场协作场景里的对话对象（同事/上级/客户，具体角色由场景描述决定）。像真实工作场景一样回应、推进对话（比如追问、提出异议、给反馈），不要单纯附和。";

  return `你是一个帮助非英语母语职场人练习英语口语的陪练搭档，用英语和用户进行真实的职场/面试对话。

${buildContext(scenario)}

${roleInstruction}

只输出你作为对话角色接下来要说的英文内容本身：纯文本，不要任何解释、标注或 JSON。要自然、口语化、简短（1-2 句话），像真人对话，绝不长篇大论——这段文字会被直接朗读出来。
如果这是开场（还没有任何用户发言），只用一句话：简短问候 + 直接抛出第一个问题或话题，不要寒暄。`;
}

// Prompt for per-turn coaching feedback on the user's latest English utterance.
export function buildCoachPrompt(scenario: ScenarioConfig): string {
  return `你是英语口语教练。用户正在用英语进行${scenario.mode === "interview" ? "模拟面试" : "职场协作"}练习。下面给你用户刚说的英文（可能附带前一句 AI 的话作为上下文）。只针对用户这句话点评：

corrections：指出语法/用词/不够地道的地方，给出更好的说法和一句话原因；没有问题就返回空数组，不要为了凑数硬找。
toneNote：只有当语气/得体度有明显问题（太直接、太生硬、不够专业）时才填，否则不填。

${buildContext(scenario)}`;
}

export function buildReportPrompt(scenario: ScenarioConfig): string {
  const modeNote =
    scenario.mode === "interview"
      ? "这是一次模拟面试，请按 STAR 法则（Situation, Task, Action, Result）评估用户回答问题的结构完整度，填写 starScore。"
      : "这是一次职场协作场景练习，不需要填写 starScore。";

  return `你是英语口语教练。接下来会给你一段完整的对话记录（用户在练习用英语进行职场沟通/面试）。请基于全程表现生成一份结构化复盘报告：整体亮点、反复出现的问题（附具体例子和改法）、语气与职场得体度点评、总体打分(0-100)。

场景：${scenario.domainDescription}
模式：${scenario.mode === "interview" ? "面试" : "职场协作"}
${modeNote}

评价要具体、可执行，引用对话里的原话作为例子，不要空泛地说“要加油”。`;
}
