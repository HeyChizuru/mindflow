# OpenMAIC 项目学习指南

> 本文档帮你从零理解 OpenMAIC 的架构和代码组织方式。
> 按照推荐的阅读顺序走完，你将掌握项目的整体设计，具备后续改造的能力。


```
## 目录
OpenMAIC-main/
├── app/                          # Next.js App Router (页面 + API)
│   ├── layout.tsx                # 根布局 (ThemeProvider + I18n + 鉴权)
│   ├── page.tsx                  # 首页
│   ├── globals.css               # 全局样式
│   ├── classroom/[id]/page.tsx   # 课堂页面
│   ├── generation-preview/       # 生成预览页
│   └── api/                      # 后端 API 路由 (20+)
│       ├── chat/                 # 实时对话 SSE
│       ├── generate-classroom/   # 课堂生成
│       ├── generate/             # 生成子链路 (大纲/内容/动作/图片/视频/TTS)
│       ├── parse-pdf/            # PDF 解析
│       ├── quiz-grade/           # 测验评分
│       ├── web-search/           # 网页搜索
│       └── ...
│
├── components/                   # React 组件
│   ├── stage.tsx                 # Stage 主组件 (edit/playback 分发)
│   ├── header.tsx                # 顶部导航
│   ├── edit/                     # 编辑模式 (EditChromeRoot, PlaybackChromeRoot)
│   ├── stage/                    # 场景渲染 (侧边栏/缩略图/渲染器)
│   ├── slide-renderer/           # 幻灯片渲染引擎 + 编辑器 Canvas
│   ├── canvas/                   # 画布组件
│   ├── chat/                     # 聊天面板
│   ├── agent/                    # AI 代理头像/配置
│   ├── audio/                    # 语音按钮
│   ├── roundtable/               # 圆桌讨论
│   ├── scene-renderers/          # 特殊场景渲染 (测验/PBL)
│   ├── generation/               # 生成进度条/大纲编辑器
│   ├── settings/                 # 设置面板 (模型/TTS/ASR/图片/视频)
│   ├── whiteboard/               # 白板组件
│   ├── ai-elements/              # AI 对话 UI 组件库
│   └── ui/                       # 基础 UI 组件 (button/dialog/select...)
│
├── lib/                          # 核心逻辑层
│   ├── types/                    # TypeScript 类型定义
│   │   ├── action.ts             # ★ Action 联合类型 (18 种)
│   │   ├── stage.ts              # Stage/Scene/Slide 类型
│   │   └── ...
│   ├── store/                    # Zustand 状态管理
│   │   ├── stage.ts              # useStageStore
│   │   ├── canvas.ts             # useCanvasStore
│   │   ├── settings.ts           # useSettingsStore
│   │   └── ...
│   ├── action/engine.ts          # ★ ActionEngine 统一执行层
│   ├── playback/engine.ts        # ★ PlaybackEngine 回放状态机
│   ├── generation/               # 两阶段生成流水线
│   │   ├── pipeline-runner.ts    # 流水线调度
│   │   ├── outline-generator.ts  # 阶段1：大纲生成
│   │   ├── scene-generator.ts    # 阶段2：场景内容+动作生成
│   │   └── scene-builder.ts      # 场景组装
│   ├── ai/                       # AI 调用层 (Vercel AI SDK)
│   │   ├── llm.ts                # callLLM / streamLLM
│   │   └── providers.ts          # 模型提供商配置
│   ├── orchestration/            # 多代理编排
│   ├── edit/                     # 编辑模式逻辑
│   ├── media/                    # 图片/视频生成适配器
│   ├── audio/                    # TTS/ASR 语音
│   ├── export/                   # 导出 (PPTX/ZIP)
│   ├── i18n/                     # 国际化 (7 种语言)
│   ├── prompts/                  # AI Prompt 模板
│   ├── hooks/                    # 通用 Hooks
│   └── utils/                    # 工具函数 (database.ts = Dexie/IndexedDB)
│
├── configs/                      # 配置文件 (图表/字体/动画/热键...)
├── tests/                        # 单元测试
├── e2e/                          # E2E 测试 (Playwright)
├── public/logos/                 # 各 AI 提供商 Logo
├── assets/                       # 演示 GIF/PNG
├── docs/                         # 文档
├── middleware.ts                 # 访问码鉴权中间件
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```
## 第一步：理解项目是什么

OpenMAIC 是一个 **AI 互动课堂平台**。核心流程：

```
用户输入需求（文本 + 可选 PDF）
    ↓
AI 两阶段生成课堂
    ├─ 阶段1：生成场景大纲（流式输出）
    └─ 阶段2：为每个场景生成内容 + 教学动作
    ↓
课堂播放（回放引擎驱动）
    ├─ 自动播放：AI 代理讲课、讨论、问答
    └─ 编辑模式：用户手动修改幻灯片
```

先花 2 分钟看入口页，建立直觉：

- `app/page.tsx` — 首页，用户输入需求、上传 PDF、点击"进入课堂"
- `app/layout.tsx` — 根布局，ThemeProvider + I18nProvider + AccessCodeGuard

---

## 第二步：架构全景

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Next.js App Router)             │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  首页     │  │ 课堂生成预览  │  │  课堂页面 (Stage)       │  │
│  │ page.tsx  │  │ generation-  │  │  classroom/[id]/     │  │
│  │          │  │ preview/     │  │  page.tsx             │  │
│  └──────────┘  └──────────────┘  └───────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Stage 组件                          │    │
│  │         mode === 'edit'  → EditChromeRoot           │    │
│  │         mode === 'playback' → PlaybackChromeRoot    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Zustand Stores (全局状态)               │    │
│  │  useStageStore   — 课堂数据 (Stage/Scene/Action)     │    │
│  │  useCanvasStore  — 编辑器 UI 状态                    │    │
│  │  useSettingsStore — 配置 (模型/提供商/音频)            │    │
│  │  useAgentRegistry — AI 代理注册表                    │     │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                 │
│                     IndexedDB (Dexie)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP / SSE
┌───────────────────────────┴─────────────────────────────────┐
│                    后端 (Next.js Route Handlers)             │
│                                                             │
│  /api/generate-classroom  → 课堂生成 (异步 Job)               │
│  /api/chat                → 实时对话 (SSE 流)                │
│  /api/generate/image      → 图片生成                         │
│  /api/generate/video      → 视频生成                         │
│  /api/parse-pdf           → PDF 解析                         │
│  /api/quiz-grade          → 测验评分                         │
│  /api/web-search          → 网页搜索                         │
│                           │                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              AI 调用层 (lib/ai/)                      │   │
│  │  Vercel AI SDK → OpenAI / Claude / Gemini / ...      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**关键架构决策**：Action 是通用接口。生成流水线产出 Action，回放引擎消费 Action，两者共享同一个 `ActionEngine` 执行层。

---

## 第三步：核心数据模型

在读代码之前，先理解三个核心类型，它们贯穿整个项目：

```
Stage（课堂）
  ├── id, name, description
  ├── whiteboard: Slide[]        ← 白板数据
  ├── generatedAgentConfigs      ← AI 代理配置
  └── Scene[]                    ← 场景列表（有序）
        ├── id, type, order
        ├── content: SceneContent  ← 场景内容（4种类型）
        │     ├── SlideContent     ← 幻灯片（文本/图片/形状/图表/LaTeX...）
        │     ├── QuizContent      ← 测验
        │     ├── InteractiveContent ← 交互式内容 (iframe)
        │     └── PBLContent       ← 问题驱动学习
        └── actions: Action[]      ← 教学动作序列（驱动回放）
              ├── speech           ← AI 讲话
              ├── discussion       ← 圆桌讨论
              ├── spotlight/laser  ← 视觉效果
              ├── wb_*             ← 白板操作
              └── widget_*         ← 交互组件操作
```

**读这三个文件即可理解全貌**：

1. `lib/types/stage.ts` — Stage、Scene、SceneContent 类型定义
2. `lib/types/action.ts` — Action 联合类型（20+ 种动作）
3. `lib/types/slides.ts` — Slide 元素类型（文本/图片/形状/图表/表格/LaTeX/视频/音频/代码）

---

## 第四步：按构建顺序读代码

以下模拟"从零构建这个项目"的顺序。每个阶段告诉你读哪些文件、建立了什么、和前面阶段的关系。

---

### 阶段 1：项目骨架与入口

**建立的东西**：Next.js 项目 + Tailwind + 主题 + 国际化 + 访问码鉴权

**阅读顺序**：

| 文件 | 看什么 |
|------|--------|
| `package.json` | 技术栈全貌：Next.js 16、React 19、Tailwind 4、Zustand 5、Vercel AI SDK 6 |
| `next.config.ts` | standalone 输出、transpilePackages（workspace 子包）、安全头 |
| `tsconfig.json` | `@/*` 路径别名 |
| `pnpm-workspace.yaml` | monorepo 结构：`packages/*` |
| `app/layout.tsx` | 根布局：ThemeProvider → I18nProvider → AccessCodeGuard → children |
| `middleware.ts` | HMAC 签名访问码验证（Edge Runtime） |
| `lib/hooks/use-theme.tsx` | 主题切换逻辑 |
| `lib/hooks/use-i18n.tsx` | i18next 国际化，7 种语言 |

**读完你能回答**：项目用什么技术栈？入口在哪？主题和国际化怎么工作的？访问码怎么保护的？

---

### 阶段 2：数据模型与状态管理

**建立的东西**：核心类型定义 + Zustand Store + IndexedDB 持久化

**阅读顺序**：

| 文件 | 看什么 |
|------|--------|
| `lib/types/stage.ts` | Stage、Scene、SceneContent、StageMode 类型 |
| `lib/types/slides.ts` | ElementTypes 枚举、各种元素接口 |
| `lib/types/action.ts` | Action 联合类型（speech/discussion/spotlight/wb_*/widget_*） |
| `lib/store/stage.ts` | **核心 Store**：stage、scenes、currentSceneId、mode；debounce 持久化到 IndexedDB |
| `lib/store/canvas.ts` | 编辑器 UI 状态：选中元素、视口、工具栏、教学效果 |
| `lib/store/settings.ts` | 设置 Store：模型选择、提供商配置、TTS/ASR/PDF/图片/视频提供商 |
| `lib/store/index.ts` | Store barrel 导出 |
| `lib/utils/database.ts` | Dexie 数据库定义（IndexedDB 表结构） |

**读完你能回答**：数据怎么定义的？状态怎么管理的？数据怎么持久化的？

---

### 阶段 3：AI 调用层

**建立的东西**：统一的 LLM 调用接口，支持多家提供商

**阅读顺序**：

| 文件 | 看什么 |
|------|--------|
| `lib/ai/providers.ts` | 提供商注册表：OpenAI/Claude/Gemini/DeepSeek/Qwen/Kimi 等 10+ 家 |
| `lib/ai/llm.ts` | `callLLM()` / `streamLLM()` 封装：thinking/reasoning 配置注入、重试 |
| `lib/ai/thinking-config.ts` | 思维链配置（哪些模型支持、budget 设置） |
| `lib/ai/model-metadata.ts` | 模型元数据目录（能力声明） |

**读完你能回答**：怎么调用不同 AI 模型？添加新提供商需要改哪里？

---

### 阶段 4：课堂生成流水线

**建立的东西**：从用户需求到完整课堂的两阶段生成流程

**阅读顺序**：

| 文件 | 看什么 |
|------|--------|
| `app/generation-preview/page.tsx` | 生成预览页面：SSE 流式接收大纲、进度展示、大纲编辑确认 |
| `lib/generation/outline-generator.ts` | **阶段1**：从需求生成场景大纲（SceneOutline[]） |
| `lib/generation/scene-generator.ts` | **阶段2**：从大纲生成完整场景内容 + 教学动作 |
| `lib/generation/pipeline-runner.ts` | 流水线编排：串联阶段1和阶段2 |
| `lib/generation/pipeline-types.ts` | 流水线类型定义 |
| `lib/generation/prompt-formatters.ts` | 提示词格式化工具 |
| `app/api/generate-classroom/route.ts` | 生成 API 入口：创建异步 Job、后台执行 |
| `app/api/generate-classroom/[jobId]/route.ts` | Job 状态轮询端点 |

**读完你能回答**：课堂是怎么从无到有生成的？大纲和场景分别怎么生成的？SSE 流式怎么工作的？

---

### 阶段 5：回放引擎（核心）

**建立的东西**：Action 驱动的状态机，自动播放课堂内容

这是项目最核心的部分。回放引擎消费 `Scene.actions[]`，按顺序执行每个动作。

**阅读顺序**：

| 文件 | 看什么 |
|------|--------|
| `lib/playback/engine.ts` | **回放状态机**：idle → playing → paused / live。`processNext()` 核心循环：读 action → 执行 → 下一个 |
| `lib/playback/types.ts` | PlaybackEngineCallbacks（事件钩子）、PlaybackView 类型 |
| `lib/playback/derived-state.ts` | `computePlaybackView()`：从原始状态派生出"当前该显示什么" |
| `lib/action/engine.ts` | **ActionEngine**：执行各种 Action 的共享层（spotlight → canvas、speech → audio、wb_* → whiteboard） |
| `components/edit/PlaybackChromeRoot.tsx` | 回放模式的 UI 容器：集成 PlaybackEngine + ActionEngine + 圆桌 + TTS |
| `components/roundtable/index.tsx` | 圆桌讨论组件：多代理对话、语音输入、TTS 输出 |

**回放引擎状态图**：

```
                start()                  pause()
 idle ---------> playing -------------> paused
   ^                 ^                       |
   |                 |  resume()             |
   |                 +-----------------------+
   |
   |  handleEndDiscussion()
   |                         confirmDiscussion()
   |                         / handleUserInterrupt()
   |                              |
   +---------------------------- live ------------> paused
                                 ^                    |
                                 | resume / user msg  |
                                 +--------------------+
```

**读完你能回答**：课堂自动播放的原理是什么？Action 怎么被执行的？讨论/问答怎么触发的？

---

### 阶段 6：编辑模式

**建立的东西**：Pro 模式下的幻灯片编辑器

**阅读顺序**：

| 文件 | 看什么 |
|------|--------|
| `components/stage.tsx` | **Stage 组件**：mode 分发 — edit → EditChromeRoot，playback → PlaybackChromeRoot |
| `components/edit/EditChromeRoot.tsx` | 编辑模式入口：EditShell + SlideNavRail + HeaderControls |
| `components/edit/EditShell/EditShell.tsx` | 编辑器外壳：**Surface Registry 模式** — 根据 scene.type 解析对应的编辑器 surface |
| `lib/edit/slide-schema.ts` | 幻灯片 schema 迁移（`migrateScene()`） |
| `lib/edit/slide-ops.ts` | 幻灯片操作（增删改查元素） |
| `lib/hooks/use-canvas-operations.ts` | Canvas CRUD 操作 hook |
| `lib/hooks/use-history-snapshot.ts` | 撤销/重做（快照机制） |
| `lib/store/whiteboard-history.ts` | 白板历史快照 |

**读完你能回答**：编辑模式和回放模式怎么切换的？幻灯片编辑器的架构是什么？撤销/重做怎么实现的？

---

### 阶段 7：交互系统

**建立的东西**：聊天、语音、代理系统

**阅读顺序**：

| 文件 | 看什么 |
|------|--------|
| `components/chat/chat-area.tsx` | 聊天区域主组件，暴露 imperative API（createSession/sendMessage/startDiscussion） |
| `components/chat/use-chat-sessions.ts` | 聊天引擎 hook：会话生命周期、流式响应、代理循环 |
| `components/chat/chat-session.tsx` | 消息气泡渲染（UIMessage 格式） |
| `lib/orchestration/stateless-generate.ts` | **编排入口**：LangGraph StateGraph → director → agent_generate |
| `lib/orchestration/director-graph.ts` | LangGraph 拓扑：导演节点决定谁发言、代理节点生成内容 |
| `lib/orchestration/prompt-builder.ts` | 系统提示词构建 |
| `lib/store/interactive-iframe-pool.ts` | 交互式 iframe 池（keep-alive、零重载） |
| `lib/audio/tts-providers.ts` | TTS 提供商（Azure、VoxCPM 等） |
| `lib/audio/voice-resolver.ts` | 代理 → TTS 声音映射 |

**读完你能回答**：聊天系统怎么工作的？多代理怎么协调发言的？语音合成怎么集成的？

---

### 阶段 8：媒体、导出与周边功能

**建立的东西**：图片/视频生成、PPTX 导出、PBL、测验、白板、Web 搜索

**按需阅读**（不需要全读，按你的改造需求选读）：

| 模块 | 文件 | 看什么 |
|------|------|--------|
| **媒体生成** | `lib/media/media-orchestrator.ts` | 并行调度图片/视频生成任务 |
| **图片生成** | `lib/media/image-providers.ts` + `app/api/generate/image/route.ts` | 图片提供商配置 + API |
| **视频生成** | `lib/media/video-providers.ts` + `app/api/generate/video/route.ts` | 视频提供商配置 + API |
| **PPTX 导出** | `lib/export/use-export-pptx.ts` | 幻灯片 → PPTX（元素映射、LaTeX→OMML） |
| **课堂导入/导出** | `lib/export/classroom-zip-utils.ts` | ZIP 打包导出 |
| **PDF 解析** | `lib/pdf/` + `app/api/parse-pdf/route.ts` | PDF 文本/图片提取 |
| **PBL** | `lib/pbl/generate-pbl.ts` | MCP 工具驱动的 PBL 项目生成 |
| **测验** | `components/scene-renderers/quiz-renderer.tsx` + `lib/quiz/grading.ts` | 测验渲染 + AI 评分 |
| **白板** | `components/whiteboard/index.tsx` | 画笔/橡皮擦/历史快照 |
| **Web 搜索** | `lib/web-search/constants.ts` + `app/api/web-search/route.ts` | Tavily/Bocha/Brave/Baidu |
| **设置面板** | `components/settings/index.tsx` | 全局设置 UI（模型/提供商/音频/代理） |
| **代理管理** | `lib/orchestration/registry/store.ts` | 代理注册表 CRUD |

---

## 第五步：文件依赖关系图

理解模块间的依赖关系，方便你定位改造范围：

```
用户输入需求
  │
  ▼
app/page.tsx (首页)
  │
  ├─→ app/generation-preview/page.tsx (生成预览)
  │     │
  │     ├─→ lib/generation/outline-generator.ts (大纲生成)
  │     │     └─→ lib/ai/llm.ts → Vercel AI SDK
  │     │
  │     └─→ lib/generation/scene-generator.ts (场景生成)
  │           └─→ lib/generation/scene-builder.ts
  │
  ▼
app/classroom/[id]/page.tsx (课堂页面)
  │
  ├─→ components/stage.tsx (Stage 容器)
  │     │
  │     ├─→ components/edit/EditChromeRoot.tsx (编辑模式)
  │     │     └─→ lib/edit/* (幻灯片操作)
  │     │
  │     └─→ components/edit/PlaybackChromeRoot.tsx (回放模式)
  │           │
  │           ├─→ lib/playback/engine.ts (回放状态机)
  │           │     └─→ lib/action/engine.ts (Action 执行器)
  │           │
  │           ├─→ components/roundtable/ (圆桌讨论)
  │           ├─→ components/chat/ (聊天)
  │           │     └─→ lib/orchestration/stateless-generate.ts
  │           │           └─→ lib/orchestration/director-graph.ts
  │           │                 └─→ lib/ai/llm.ts
  │           │
  │           └─→ components/whiteboard/ (白板)
 五│
  └─→ lib/store/stage.ts (核心 Store)
        └─→ lib/utils/database.ts (IndexedDB 持久化)
```

---

## 第六步：常见改造场景速查

| 你想做的事 | 需要读的文件 |
|-----------|-------------|
| **添加新的 AI 提供商** | `lib/ai/providers.ts`（注册表） + `lib/ai/model-metadata.ts`（能力声明） |
| **修改课堂生成逻辑** | `lib/generation/outline-generator.ts` + `scene-generator.ts` + `pipeline-runner.ts` |
| **修改回放行为** | `lib/playback/engine.ts`（状态机） + `lib/action/engine.ts`（执行器） |
| **添加新的 Action 类型** | `lib/types/action.ts`（类型定义） → `lib/action/engine.ts`（执行逻辑） → `lib/playback/engine.ts`（调度） |
| **添加新的场景类型** | `lib/types/stage.ts`（SceneContent 扩展） → `components/scene-renderers/`（渲染） → `lib/edit/`（编辑器 surface） |
| **修改聊天/讨论逻辑** | `components/chat/use-chat-sessions.ts` + `lib/orchestration/director-graph.ts` |
| **添加新的 TTS 提供商** | `lib/audio/tts-providers.ts` + `lib/audio/constants.ts` |
| **添加新的媒体提供商** | `lib/media/image-providers.ts` 或 `video-providers.ts` |
| **修改设置面板** | `components/settings/index.tsx` + `lib/store/settings.ts` |
| **修改导出格式** | `lib/export/use-export-pptx.ts` |
| **添加新的 Web 搜索引擎** | `lib/web-search/constants.ts` + `lib/web-search/types.ts` |
| **修改 PBL 逻辑** | `lib/pbl/generate-pbl.ts` + `lib/pbl六mcp/` |

---

## 总结：推荐阅读路线

```
快速理解（30 分钟）:
  app/page.tsx → app/layout.tsx → lib/types/stage.ts → lib/types/action.ts

理解生成流程（1 小时）:
  → lib/ai/providers.ts → lib/ai/llm.ts
  → lib/generation/outline-generator.ts → scene-generator.ts
  → app/generation-preview/page.tsx

理解回放引擎（1 小时）:
  → lib/playback/engine.ts → lib/action/engine.ts
  → components/edit/PlaybackChromeRoot.tsx
  → components/roundtable/index.tsx

理解编辑模式（30 分钟）:
  → components/stage.tsx → components/edit/EditChromeRoot.tsx
  → lib/edit/slide-ops.ts → lib/hooks/use-history-snapshot.ts

理解交互系统（1 小时）:
  → components/chat/use-chat-sessions.ts
  → lib/orchestration/stateless-generate.ts → director-graph.ts
  → lib/store/interactive-iframe-pool.ts

按需扩展:
  → 看第六步速查表，按你的改造需求选读
```
