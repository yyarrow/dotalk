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

  const personaInstruction = scenario.persona
    ? `\n\n对话风格：${scenario.persona.prompt} 用英文对话时自然地体现这种风格，但始终保持得体、聚焦，不要出戏或改说中文。`
    : "";

  return `你是一个帮助非英语母语职场人练习英语口语的陪练搭档，用英语和用户进行真实的职场/面试对话。

${buildContext(scenario)}

${roleInstruction}${personaInstruction}

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

// Prompt for the audio-native observer (Gemini). It receives the raw audio of
// one user turn and returns the Observation schema.
export function buildObservePrompt(scenario: ScenarioConfig): string {
  return `你是英语口语教练，正在旁听用户的${scenario.mode === "interview" ? "模拟面试" : "职场协作"}练习。附带的音频是用户刚说的一段话——可能是英文，也可能中英混说（英文卡壳时他会临时用中文顶一下）。请听音频后输出：

transcript：如实转写他说的内容，中英混说就原样保留。
englishForInterviewer：把这段话（含中文部分的意思）整理成通顺、地道、第一人称的英文，就像他本想用英文说出来的样子——这会作为对话对象听到的内容用来推进对话。
corrections：针对他说出的英文，指出语法/用词/不地道之处，给更好的说法和一句话原因；没有就空数组，别硬凑。
suggestedEnglish：如果他有明显说不出、用中文顶替或卡壳的意思，告诉他那个意思地道的英文该怎么说；全程英文流畅就不填。
pronunciationNotes：根据音频里的实际发音，指出明显的发音/口音问题（某个音发不准、重音、连读等），定性描述即可，绝不编造；没有明显问题就不填。

${buildContext(scenario)}`;
}

// Prompt for turning one session into targeted training material.
export function buildDrillsPrompt(scenario: ScenarioConfig): string {
  return `你是英语口语教练。下面是用户一次${scenario.mode === "interview" ? "模拟面试" : "职场协作"}练习的完整对话记录（含教练之前标注的纠错/更地道说法）。请针对**这位用户在这场里暴露的具体问题**，生成个性化训练材料，全部贴合他的领域，不要泛泛：

phrases：他明显缺的、想说却说不出的地道表达/搭配/术语，5-8 个。每个给 target(英文表达)、meaning(中文含义或何时用)、example(用它的地道英文例句)。优先选他这场真的卡住或用错的。
retries：他答得不好、值得重新组织再答一遍的问题，2-3 个。question 用对方问过的英文原问，skeleton 给"一句话概括 + 分层要点"的模范骨架，引导他重答。
shadow：把他某段磕巴/碎片化的回答改写成干净、地道、可直接朗读跟读的模范答案，2-3 段。model 是改写后的英文答案，focus 用中文一句点明这段重点练什么。

只基于记录里真实出现的问题，别编造他没提过的内容。

场景：${scenario.domainDescription}`;
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
