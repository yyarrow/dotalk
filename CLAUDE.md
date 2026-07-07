# DoTalk — 英文职场协作 & 面试口语练习平台

定位:「职场协作英语」细分(standup、push-back、给反馈、1:1、谈判)+ 面试练习,领域可自定义(用户可传 JD/简历)。语音对话 → 逐轮快速回复 → 会后结构化报告(语法/语气/职业度)。

## 运行(pnpm,Next.js 16 + React 19 + Tailwind 4 + AI SDK 7)
```bash
pnpm install
cp .env.example .env.local   # 填 DEEPGRAM_API_KEY、OPENROUTER_API_KEY、至少一家 TTS key
pnpm dev        # build: pnpm build / lint: pnpm lint
```
用户流程:首页选场景 → `/practice` 实时语音 → `/report` 反馈报告 → `/history`(localStorage)。

## 架构决策(改动前先理解这几条)
- **STT 浏览器直连 Deepgram Flux**:Vercel Functions 撑不住双工音频,所以浏览器直接 WebSocket 连 `wss://api.deepgram.com/v2/listen`,`/api/deepgram-token` 只负责发短时 JWT(1h);音频 16kHz PCM16,AudioWorklet 80ms 帧(`public/pcm-worklet.js`)。
- **快慢双模型**:逐轮回复走 `OPENROUTER_TURN_MODEL`(默认 deepseek-v4-flash,延迟优先);会后报告走 `OPENROUTER_MODEL`(默认 deepseek-v4-pro)。LLM 统一 OpenRouter,配置在 `src/lib/dialogue.ts`。
- **TTS 可插拔**:`TTS_PROVIDER` = azure(默认)| elevenlabs | deepgram | cartesia,实现在 `src/lib/tts/*.ts`,加新供应商照这个模式。各家 key/voice 的 env 名见 `.env.example`(Cartesia 的 VOICE_ID 没有默认值,必填)。
- **无状态 MVP**:无登录无数据库,场景配置 sessionStorage、历史 localStorage;对话是"对讲机模式"(AI 说话时闭麦),真打断需要 LiveKit/Pipecat 级别的编排服务,暂不做。

## 结构
`src/app/api/` turn/tts/deepgram-token/parse/report/coach · `src/lib/` dialogue.ts(模型)、prompts.ts、schemas.ts(Zod)、tts/ · JD/简历解析用 pdf-parse + mammoth(next.config.ts 里设为 external)。

## 约定
- 未来要国内外双支持,供应商相关配置保持可插拔、不写死。
- 部署目标 Vercel,标准 Next.js,无需特殊配置。
