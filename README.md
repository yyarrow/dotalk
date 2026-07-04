# DoTalk

用英语进行"职场协作"和"面试"的实战陪练平台。目标不是学英语本身，而是让用户在真实工作场景（站会、需求讨论、给反馈、谈判、汇报）和面试场景里，敢开口、说得像样。

## 定位与差异化

调研了现有玩家，市场大致分四类：

| 细分 | 代表产品 | 打法 |
|---|---|---|
| 发音纠正 | ELSA Speak | 逐音素打分 |
| 表达教练（演讲/汇报节奏） | Yoodli | 填充词、语速、能量值反馈 |
| 场景对话陪练 | Talkio AI、SmallTalk2Me、Eli (Elispeak) | 多语言、多角色场景库 |
| 面试实时提词/copilot | OphyAI、AceRound | 面试进行时的悄悄话提示，不是练习 |

**空白点**：几乎没有产品专门做"职场协作英语"这个场景颗粒度——不是泛泛的日常对话，也不是纯面试题库，而是"如何在站会里同步进度"、"如何委婉反驳同事的方案"、"如何在 1:1 里给下属负反馈"这类具体协作动作。这是 DoTalk 可以切入的角度：**场景真实度 + 结构化反馈（不只是通顺，还要专业/得体）**，比通用场景库更垂直。

## 技术架构（已实现）

语音管线：**Deepgram Flux（STT）→ DeepSeek V4 Pro（经 OpenRouter，对话 + 结构化反馈）→ TTS（可切换供应商）**。

Vercel 不支持长连接双工音频（Functions 最长 300-800秒、无原生 WebSocket），所以按连接方向拆开：

- **STT（浏览器 ↔ Deepgram，真双工，绕开 Vercel）**：浏览器直接开 WebSocket 连 `wss://api.deepgram.com/v2/listen`（Flux 模型），认证用 [`/api/deepgram-token`](src/app/api/deepgram-token/route.ts) 现场发的短期 JWT（`Sec-WebSocket-Protocol: token,<jwt>`），永久 key 不下发到浏览器。音频用 AudioWorklet（[`public/pcm-worklet.js`](public/pcm-worklet.js)）转成 16kHz mono PCM16，80ms 一帧发送。
- **对话+反馈（Vercel Function）**：[`/api/turn`](src/app/api/turn/route.ts) 用 AI SDK 的 `generateObject` 经 OpenRouter 调对话模型（默认 `deepseek/deepseek-v4-pro`，改 `OPENROUTER_MODEL` 即可换任意模型），一次返回英文回复 + 语法纠错 + 语气点评（schema 见 [`lib/schemas.ts`](src/lib/schemas.ts)，provider 配置在 [`lib/dialogue.ts`](src/lib/dialogue.ts)）。
- **TTS（Vercel Function，单向流，天然适配 serverless）**：[`/api/tts`](src/app/api/tts/route.ts) 只是个薄壳，实际合成逻辑在 [`lib/tts/`](src/lib/tts)，按 `TTS_PROVIDER` 环境变量分发到四个供应商之一，key 都不出服务器：

  | 供应商 | 首字延迟 | 大致单价(每百万字) | 特点 |
  |---|---|---|---|
  | `azure`（默认） | ~300-500ms | ~$16（每月送50万字） | 最便宜，有免费额度，先用它跑通 |
  | `deepgram` | ~90-200ms | ~$30 | 复用已有的 Deepgram key，账单合并 |
  | `elevenlabs` | ~75ms | 按套餐折算较贵 | 音色表现力最强 |
  | `cartesia` | ~40-90ms | ~$39（按月付套餐折算） | 延迟最低，适合后续做打断/更自然的实时感 |

  换供应商只改 `TTS_PROVIDER`，不用改代码；四个供应商的 key 可以都配上，随时切换对比效果和账单。
- **文档解析（Vercel Function，无状态）**：[`/api/parse-document`](src/app/api/parse-document/route.ts) 用 `pdf-parse`/`mammoth` 现抽现返，不落盘。

MVP 阶段没做账号系统和云端持久化——场景配置存 `sessionStorage`，练习历史存浏览器 `localStorage`（见 [`lib/history.ts`](src/lib/history.ts)）。单机可用，多设备同步之类留到验证完产品价值再做。

对话轮次是严格轮流（walkie-talkie 式）：AI 说话时不监听麦克风，说完才重新开始听，没做打断（barge-in）——真打断需要一个常驻编排进程才能做得稳，MVP 先不做。

## 本地运行

```bash
pnpm install
cp .env.example .env.local   # 填 DEEPGRAM_API_KEY / OPENROUTER_API_KEY / 至少一个 TTS 供应商的 key
pnpm dev
```

必填：[Deepgram](https://console.deepgram.com)（STT）、[OpenRouter](https://openrouter.ai/keys)（对话，`OPENROUTER_API_KEY` + `OPENROUTER_MODEL`）。TTS 默认走 Azure，去 [Azure AI Speech](https://portal.azure.com) 建一个 Speech 资源拿 `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`；想换供应商就配对应的 key 并把 `TTS_PROVIDER` 改成 `elevenlabs`/`deepgram`/`cartesia`。

流程：首页选场景（职场协作/面试）、写场景描述、可选传JD/简历 → `/practice` 语音对话 → 结束后 `/report` 生成结构化报告 → `/history` 看本地历史记录。

## 已知限制 / 下一步

- [ ] `CARTESIA_VOICE_ID` 没给默认值——去 Cartesia 的 voice library 挑一个真实存在的 voice id 填进去，瞎填会 500
- [ ] 没有打断/barge-in，AI 说话时麦克风是关的
- [ ] 每轮都重开一次 Deepgram 连接（简单但有一点延迟开销），量大了可以优化成常驻连接+静音而不是断开重连
- [ ] 拉3-5个目标用户做场景访谈，验证"职场协作英语"这个切入点是不是真痛点
- [ ] 真要扩量，实时这条线迁移到独立编排服务（LiveKit/Pipecat），Vercel 只留前端+账号+报告生成
