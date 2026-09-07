# MindFlow 项目开发指南

**版本**：v1.2  
**状态**：MVP 实施手册（含 M2+ / Phase 2 拓展指引）  
**最后更新**：2026-09-07  

> **适用范围**：本指南面向 **独立 MindFlow 新仓库**，不 fork OpenMAIC 全量代码。可将 `docs/` 下的 [PRD.md](./PRD.md)、[ARCHITECTURE.md](./ARCHITECTURE.md)、本文档一并复制到新仓库根目录使用。

---

## 目录

- [1. 导读与文档地图](#1-导读与文档地图)
- [2. 环境准备与仓库初始化](#2-环境准备与仓库初始化)
- [3. 开发原则（执行约束）](#3-开发原则执行约束)
- [4. 里程碑实施指南](#4-里程碑实施指南)
  - [M2+ — 大纲编辑助手（3～4 天）](#m2--大纲编辑助手34-天)
  - [Phase 2 — 冻结 Plan + 评审闭环（P2a～P2d）](#phase-2--冻结-plan--评审闭环p2ap2d)
  - [M2+ — 大纲编辑助手](#m2--大纲编辑助手3～4-天)
  - [Phase 2 — 冻结 Plan + 评审闭环](#phase-2--冻结-plan--评审闭环mvp-完成后)
- [5. OpenMAIC 移植矩阵](#5-openmaic-移植矩阵)
- [6. 页面与 API 实现 Checklist](#6-页面与-api-实现-checklist)
- [7. 数据流与联调顺序](#7-数据流与联调顺序)
- [8. 本地开发工作流](#8-本地开发工作流)
- [9. 验收与演示清单](#9-验收与演示清单)
- [10. 常见问题与 Phase 2 入口](#10-常见问题与-phase-2-入口)

---

## 1. 导读与文档地图

### 1.1 读者

个人全栈开发者，以 MindFlow 作为简历/demo 项目，展示 **Next.js + LLM + Agent + RAG + Postgres** 能力。

### 1.2 文档三角


| 文档                                   | 回答的问题                          |
| ------------------------------------ | ------------------------------ |
| [PRD.md](./PRD.md)                   | **做什么** — 功能范围、数据模型、API、RAG 规格 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | **怎么拆** — 模块划分、目录结构、分层原则       |
| **DEV_GUIDE.md（本文）**                 | **怎么做** — 从零搭建、里程碑任务、验收与联调     |


**推荐阅读顺序**：PRD → ARCHITECTURE → DEV_GUIDE。

### 1.3 MVP 与拓展一句话

**MVP**：用户通过 **提示词** 和/或 **PDF**（至少其一）创建课程，**单次 LLM** 流式生成大纲与 slide/quiz 场景，首屏完成后进入课堂播放；有 PDF 时讨论走 RAG。

**M2+（可选）**：大纲生成后，**AI SDK Tool** 大纲编辑助手辅助改 `outlines`（PRD §3.1.2）。

**Phase 2（可选）**：**Planner → 用户冻结 Plan → Drafter/Critic/Director 有界循环** 产出与 Plan 一致的 Outline；**无 Agent replan**（PRD §3.5）。

### 1.4 页面路由（与 OpenMAIC 对齐）


| 路由                    | 文件                                | 职责                              |
| --------------------- | --------------------------------- | ------------------------------- |
| `/`                   | `app/page.tsx`                    | 输入 + 课程列表 + `SettingsDialog` 按钮 |
| `/generation-preview` | `app/generation-preview/page.tsx` | ingest / Plan? / 大纲 / 助手? / 确认 / 首屏 |
| `/classroom/[id]`     | `app/classroom/[id]/page.tsx`     | 播放 + 讨论 + 后台续生成                 |


设置 **不注册路由**，使用 `components/settings/` 中的 `SettingsDialog` 弹窗。

### 1.5 明确不做（开发时勿引入）

详见 PRD [3.4 节](./PRD.md#34-明确不做mvp--第二期)，摘要：

- Pro 编辑器、TTS/ASR、AI 图/视频生成
- `interactive` / `PBL` 场景类型
- Agent 自动生成（`agent-profiles`）、联网搜索
- 课堂 zip/PPTX 导出、复杂 Roundtable UI
- 多 Provider 大型设置面板、`/settings` 独立路由
- autonomous 模式、跨 tab 编辑锁
- OpenMAIC Pro Agent Runtime（`pi-agent-core`、`lib/server/agent-runtime/`）
- Director `replan` 自动改 Plan（MindFlow Plan 冻结后禁止）

用 `lib/config/features.ts` 功能开关（PRD [13.8 节](./PRD.md#138-功能开关libconfigfeaturests-建议)）：

- `outlineOrchestration` — Phase 2 冻结 Plan + 评审循环
- `outlineAssistant` — M2+ 大纲编辑助手
- `revisionCountMax` — Phase 2 循环上限（默认 3）

---



## 2. 环境准备与仓库初始化



### 2.1 前置条件


| 工具             | 版本要求                     |
| -------------- | ------------------------ |
| Node.js        | ≥ 20                     |
| pnpm           | ≥ 9                      |
| Docker Desktop | 用于本地 Postgres + pgvector |
| Git            | 任意                       |
| OpenAI 兼容 API  | LLM + Embedding          |




### 2.2 创建仓库

```bash
pnpm create next-app@latest mindflow \
  --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"

cd mindflow
```



### 2.3 安装核心依赖

```bash
# LLM
pnpm add ai @ai-sdk/openai @ai-sdk/react

# Agent
pnpm add @langchain/core @langchain/langgraph

# 数据库
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit

# PDF
pnpm add unpdf

# 状态与 UI
pnpm add zustand sonner nanoid
pnpm add class-variance-authority clsx tailwind-merge lucide-react

# shadcn/ui（按官方文档 init 后按需添加 Dialog、Button、Input 等）
pnpm dlx shadcn@latest init
```

可选工具库：`jsonrepair`（大纲 JSON 修复）、`zod`（请求校验）。

### 2.4 初始化目录结构

按 [ARCHITECTURE.md 第 3 节](./ARCHITECTURE.md#3-推荐目录结构) 创建空目录：

```
app/
  page.tsx
  generation-preview/page.tsx
  classroom/[id]/page.tsx
  api/...
components/
  settings/
  playback/
  discussion/
  generation/
  scenes/
config/agents.json
lib/
  config/features.ts
  db/
  knowledge/
  generation/
    outline-generator.ts      # MVP
    outline-tools.ts          # M2+
    outline-graph.ts          # Phase 2
  orchestration/
  chat/
  playback/
  scenes/
uploads/
```

首版写入 `lib/config/features.ts`：

```typescript
export const features = {
  editMode: false,
  tts: false,
  mediaGeneration: false,
  webSearch: false,
  agentAutoGenerate: false,
  outlineOrchestration: false, // Phase 2
  outlineAssistant: false,     // M2+
  revisionCountMax: 3,
  sceneTypes: ['slide', 'quiz'] as const,
  rag: true,
};
```



### 2.5 环境变量（`.env.example`）

```bash
# 数据库
DATABASE_URL=postgresql://mindflow:mindflow@localhost:5432/mindflow

# LLM（服务端默认）
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=                    # 可选，兼容 API 网关
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# 文件
UPLOAD_DIR=./uploads
MAX_PDF_SIZE_MB=50
```

客户端 `SettingsDialog` 可覆盖 **模型名、Base URL**；API Key 优先走服务端 `.env`，若需客户端配置则通过专用 API Route 代理，**禁止把 Key 写进前端 bundle**。

### 2.6 Docker Compose 骨架

`docker-compose.yml`：

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: mindflow
      POSTGRES_PASSWORD: mindflow
      POSTGRES_DB: mindflow
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

启动：`docker compose up -d db`

### 2.7 复制文档

将 `docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/DEV_GUIDE.md` 放入新仓库 `docs/` 目录，并在 `README.md` 中链接。

---



## 3. 开发原则（执行约束）


| #   | 原则                                  | 违反时的典型症状                                     |
| --- | ----------------------------------- | -------------------------------------------- |
| 1   | **薄壳 Route、厚** `lib/`               | API Route 超过 80 行、难以单测；同样逻辑在多个 Route 重复      |
| 2   | `has_knowledge_base` **为 RAG 唯一开关** | 无 PDF 时仍调 retrieve；或 ingest 未完成就展示引用区        |
| 3   | **无状态** `/api/chat`                 | 服务端存 session 状态；多实例部署讨论串线                    |
| 4   | **场景类型走** `lib/scenes/registry`     | `if (type === 'quiz')` 散落在 5 个以上文件；加新类型需改多处  |
| 5   | **API Key 仅服务端**                    | `.env` 或 `NEXT_PUBLIC_`* 暴露 Key；客户端直连 OpenAI |


补充：

- 每轮 Chat 请求体携带：`messages`、`directorState`、`courseId`（对齐 OpenMAIC）。
- RAG 检索 **必须** 带 `course_id` 过滤，防止跨课程泄漏（PRD 10 节）。

### 3.1 生成流水线演进（与 PRD 3.1.1 / 3.1.2 / 3.5 对齐）

**MVP** 写死 `outline-generator.ts` + `outlines-stream`；**不在此阶段**实现 Plan 冻结或 Critic 循环。

```typescript
// app/api/generate/outlines-stream/route.ts（MVP）
export async function POST(req: Request) {
  if (features.outlineOrchestration) {
    return apiError('USE_OUTLINE_FROM_PLAN', 400, 'Call /api/generate/outline-from-plan after freezing plan');
  }
  return runLegacyOutlineStream(ctx);
}
```

**Phase 2** 分两条 API（勿与 MVP 混在一个 handler 里纠缠）：

| API | 时机 |
|-----|------|
| `POST /api/generate/curriculum-plan` | 阶段 A：出 Plan |
| `POST /api/courses/[id]/curriculum-plan/confirm` | 冻结 Plan |
| `POST /api/generate/outline-from-plan` | 阶段 B：Drafter→Critic→Director |

```typescript
// outline-graph.ts Director 路由（仅二途）
type DirectorNext = 'redraft' | 'approve';
// 禁止 replan；revisionCount >= revisionCountMax → throw RevisionLimitExceeded
```

**M2+** 独立于 Phase 2：`outline-chat` 在 outlines 已有数据后可用（MVP 或 Phase 2 产出均可）。

详见 PRD [3.1.1](./PRD.md#311-生成流水线策略mvp-固定流程--phase-2-可切换)、[3.1.2](./PRD.md#312-大纲编辑助手m2非独立-agent-系统)、[3.5](./PRD.md#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)。

---



## 4. 里程碑实施指南

总周期约 **3～4 周**（PRD 第 11 节）。建议每阶段结束打 tag 或开 PR，便于回滚。

```mermaid
flowchart LR
  M0[M0_基础设施_3天]
  M1[M1_RAG与Chat_1周]
  M2[M2_大纲与Slide_1周]
  M2p[M2plus_助手_3-4天]
  M3[M3_Quiz与Agent_1周]
  M4[M4_打磨_3天]
  P2[Phase2_P2a-P2d]
  M0 --> M1 --> M2 --> M3 --> M4
  M2 -.-> M2p
  M4 -.-> P2
```

> **M2+** 可在 M2 与 M3 之间并行；**Phase 2** 建议在 M4 之后。



---



### M0 — 基础设施（3 天）

**目标**：能连上 Postgres，创建/查询课程记录，Agent 种子数据就绪。

#### 任务清单

- [ ] `docker compose up -d db`，确认 `vector` 扩展可用
- [ ] Drizzle schema：对齐 PRD [§6.1](./PRD.md#61-表结构mvp--phase-2--m2-扩展字段)
  - MVP 表 + **预留** `courses.curriculum_plan`、`plan_status`、`plan_version`、`plan_confirmed_at`（可先 nullable，Phase 2 再用）
  - `chat_sessions.session_type` 含 `outline`；`messages.metadata`
- [ ] `lib/db/client.ts`、`drizzle.config.ts`
- [ ] 迁移：`pnpm drizzle-kit push` 或版本化 migration
- [ ] Seed：`config/agents.json` → `agents` 表（PRD [13.5 节](./PRD.md#135-固定-agent-配置示例configagentsjson)）
- [ ] `GET /api/health` → `{ ok: true, db: true }`
- [ ] `POST /api/courses`：multipart，`requirement?` + `pdf?` **至少其一**
  - 仅提示词：`requirement` ≥ 10 字符
  - 仅有 PDF：存文件到 `uploads/`，`documents` 表记元数据
  - 返回 `{ courseId, title, status: 'draft' }`
- [ ] `GET /api/courses`：最近课程列表（分页可选）



#### 关键文件


| 文件                         | 职责               |
| -------------------------- | ---------------- |
| `lib/db/schema.ts`         | 表定义 + pgvector 列 |
| `app/api/courses/route.ts` | 创建/列表            |
| `app/api/health/route.ts`  | 健康检查             |




#### 验收标准

- [ ] Docker 起库 → migrate 无报错
- [ ] `POST /api/courses` 三种输入模式（仅提示词 / 仅 PDF / 二者）均可创建记录
- [ ] `GET /api/courses` 返回刚创建的课程



#### 建议 PR

`feat(m0): drizzle schema + courses API + docker compose`

---



### M1 — RAG + 基础 Chat（1 周）

**目标**：PDF ingest 入库；chat 在有知识库时返回带引用的回答。

#### 任务清单

- [ ] `lib/knowledge/chunk.ts`：500～800 tokens，overlap 80（PRD 8.1）
- [ ] `lib/knowledge/embed.ts`：批量 embedding 写入 `chunk_embeddings`
- [ ] `lib/knowledge/ingest.ts`：parse → chunk → embed → 更新 `has_knowledge_base`
- [ ] `lib/knowledge/retrieve.ts`：topK 5～8，cosine 相似度，`course_id` 强制过滤
- [ ] `POST /api/courses/[id]/ingest`：unpdf 解析；无 PDF 返回 400
- [ ] `POST /api/chat` **最小版**：
  - 无 Director，单 LLM 回复
  - `has_knowledge_base=true` 时 retrieve + 注入 Reference Material 模板（PRD 8.2）
  - 响应含 `sources: SourceRef[]`（PRD 8.4）
- [ ] 结构化日志：`courseId`、`retrieveMs`、`tokenUsage`



#### 关键文件


| 文件                                     | 职责           |
| -------------------------------------- | ------------ |
| `lib/knowledge/*.ts`                   | RAG 全链路      |
| `app/api/courses/[id]/ingest/route.ts` | ingest 入口    |
| `app/api/chat/route.ts`                | 讨论入口（M1 简化版） |




#### 验收标准

- [ ] 上传 PDF → ingest → `courses.has_knowledge_base = true`
- [ ] `POST /api/chat` 有 PDF 时返回非空 `sources`
- [ ] 用错误 `courseId` retrieve 不返回其他课程 chunks
- [ ] 无 PDF 课程 chat 正常，`sources=[]`



#### 建议 PR

`feat(m1): knowledge ingest/retrieve + basic chat API`

---



### M2 — 大纲 SSE + Slide + 课堂壳（1 周）

**目标**：三页路由串通；流式大纲；首屏 slide 可播放。

> **流水线策略**：本阶段实现 **固定生成流程**（ingest → 单次大纲 SSE → 编辑大纲 → 首屏 scene），**不**实现 Phase 2 大纲 Agent 编排。Route 内预留 `features.outlineOrchestration` 分支即可。见 PRD [3.1.1](./PRD.md#311-生成流水线策略mvp-固定流程--phase-2-可切换)、DEV_GUIDE [§3.1](#31-生成流水线演进与-prd-311-对齐)。

#### 任务清单

- [ ] **首页** `app/page.tsx`
  - 提示词 + PDF 输入；校验 PRD 1.6
  - `POST /api/courses` → 写 `sessionStorage.generationSession` → `router.push('/generation-preview')`
  - 课程列表 → 点击跳转 `/classroom/[id]`
  - 顶栏 `SettingsDialog` 按钮（可先占位）
- [ ] **生成预览页** `app/generation-preview/page.tsx`
  - 读 session；缺失重定向 `/`
  - 有 PDF：调 ingest → SSE 大纲 → 确认/编辑 → 生成首屏 scene
  - `POST /api/generate/outlines-stream`（SSE 事件见 PRD [7.1 节](./PRD.md#71-sse-事件)）
  - `PATCH /api/courses/[id]/outlines` 保存用户编辑
  - 首屏完成 → `router.push('/classroom/[id]')`
- [ ] **课堂页** `app/classroom/[id]/page.tsx`（M2 仅 slide）
  - 从 DB 加载 course + scenes
  - 左栏场景列表、中栏 `SlideView`、底栏字幕
- [ ] `lib/generation/outline-generator.ts`：三种输入模式的 prompt 分支（ARCHITECTURE 4.2）
- [ ] `POST /api/generate/scene-content`、`POST /api/generate/scene-actions`（仅 slide handler）
- [ ] `lib/scenes/registry.ts` + `lib/scenes/handlers/slide.ts`
- [ ] `lib/playback/timeline-player.ts` + `lib/playback/pacing.ts`
- [ ] `components/playback/PlaybackShell.tsx`：订阅 player，驱动字幕（无 TTS）



#### 关键文件


| 文件                                          | 职责         |
| ------------------------------------------- | ---------- |
| `app/generation-preview/page.tsx`           | 生成主流程      |
| `app/api/generate/outlines-stream/route.ts` | SSE 大纲     |
| `lib/generation/scene-content.ts`           | 场景内容生成     |
| `lib/generation/scene-actions.ts`           | 讲稿 actions |
| `components/scenes/SlideView.tsx`           | slide 只读渲染 |




#### 验收标准

- [ ] 三种输入模式均可：首页 → generation-preview → classroom，播放第 1 页 slide
- [ ] 大纲 SSE 流式展示卡片
- [ ] 字幕随 `speech` action 切换
- [ ] 首屏生成 P95 < 60s（视模型，PRD 10 节）



#### 建议 PR

`feat(m2): outline SSE + slide generation + playback shell`

---

### M2+ — 大纲编辑助手（3～4 天）

**目标**：大纲写入 DB 后，用户可通过 **对话 + Tool** 辅助修改；会话可刷新续聊。不引入 OpenMAIC Pro Runtime。

> 依赖 M2 完成；与 M3 可并行。开关：`features.outlineAssistant`。

#### 任务清单

- [ ] `lib/generation/outline-tools.ts`：`list_outlines`、`revise_outline`、`insert_outline`、`delete_outline`
- [ ] `POST /api/courses/[id]/outline-chat`：AI SDK `streamText` + tools，SSE（PRD §7.1 大纲助手流）
- [ ] `GET /api/courses/[id]/outline-session`：`session_type=outline` + 历史 `messages`
- [ ] `components/generation/OutlineAssistantPanel.tsx`：侧栏聊天 + tool 进度
- [ ] `generation-preview` 左右分栏：助手 + `OutlinesEditor`；`outlines_updated` 时刷新列表
- [ ] **策略 A**：不强制 Outline 与 Plan 一致；确认大纲前可选 `planDriftWarning`（Phase 2 开 Plan 时）

#### 关键文件

| 文件 | 职责 |
|------|------|
| `lib/generation/outline-tools.ts` | Tool schema + execute 写 `outlines` |
| `app/api/courses/[id]/outline-chat/route.ts` | SSE + tool loop |
| `app/api/courses/[id]/outline-session/route.ts` | Session 续跑 |

#### 验收标准

- [ ] 「把第 2 页改成 quiz」→ tool 执行 → 右侧列表刷新
- [ ] 刷新 preview 页后助手聊天记录仍在
- [ ] Tool 不调用 `scene-content`（仅改 outlines）

#### 建议 PR

`feat(m2plus): outline assistant tool chat + session`

---

### M3 — Quiz + 固定 3 Agent（1 周）

**目标**：quiz 场景可答题；多 Agent Director 讨论；RAG 引用 UI。

#### 任务清单

- [ ] `lib/scenes/handlers/quiz.ts` + `components/scenes/QuizView.tsx`
- [ ] `POST /api/quiz/grade`：简答批改（参考 OpenMAIC `quiz-grade` 思路）
- [ ] 大纲 prompt 约束：slide 为主，quiz 1～2 页（PRD 3.2）
- [ ] 移植精简版 `lib/orchestration/director-graph.ts`
  - 拓扑：`START → director → agent_generate → END`
  - 固定 3 Agent：`teacher`、`student-a`、`student-b`
  - 去掉白板 action、Roundtable
- [ ] 移植 `lib/chat/agent-loop.ts`：客户端多轮调 `/api/chat` 直到 `cue_user` / `done`
- [ ] 升级 `/api/chat`：接入 LangGraph + retrieve
- [ ] `components/discussion/DiscussionPanel.tsx`
- [ ] 引用来源 UI：有 `sources` 时展示「参考来源」折叠块（PRD 8.3）
- [ ] 无知识库：不展示引用区，可选角标「基于课程内容」



#### 关键文件


| 文件                                          | 职责       |
| ------------------------------------------- | -------- |
| `lib/orchestration/director-graph.ts`       | Agent 路由 |
| `lib/chat/agent-loop.ts`                    | 客户端循环    |
| `components/discussion/DiscussionPanel.tsx` | 讨论 UI    |




#### 验收标准

- [ ] 含 quiz 的课程可出题、单选/简答可交互
- [ ] 多 Agent 轮流发言（SSE）
- [ ] 有 PDF 时 >80% 讨论轮次展示 source（PRD 1.5）
- [ ] 讨论进行中可禁用场景切换（PRD 4.2）



#### 建议 PR

`feat(m3): quiz scene + director graph + discussion panel`

---



### M4 — 续生成与打磨（3 天）

**目标**：后台续生成剩余场景；错误重试；SettingsDialog；可演示。

#### 任务清单

- [ ] `POST /api/courses/[id]/generate-remaining`：课堂页后台串行生成剩余 scenes
- [ ] 课堂页轮询或 SSE 更新场景列表（生成中骨架、失败重试按钮）
- [ ] 单页生成失败：重试该 outline，不影响其他页
- [ ] 大纲 JSON：`jsonrepair` + 最多 2 次重试（PRD 12 节）
- [ ] 仅 PDF 路径：ingest 后生成 `languageDirective` + `title` 供用户确认
- [ ] **精简** `SettingsDialog`（`components/settings/index.tsx`）
  - LLM API Key、Base URL、Model Name、Embedding 模型
  - **无** `/settings` **路由**；三页顶栏均可打开
  - 持久化：`localStorage` 或 Zustand store
- [ ] `README.md`：快速开始、架构图链接、OpenMAIC 致谢
- [ ] 演示录屏（见第 9 节分镜）



#### 验收标准

- [ ] 首屏进入课堂后，剩余 scenes 后台生成完毕
- [ ] 完整走通 PRD [1.5 成功指标](./PRD.md#15-成功指标mvp)
- [ ] SettingsDialog 可配置模型并生效
- [ ] 生成失败可重试单页



#### 建议 PR

`feat(m4): generate-remaining + settings dialog + polish`

---

### Phase 2 — 冻结 Plan + 评审闭环（P2a～P2d）

**目标**：Planner 出 Plan → 用户手改并 **冻结** → Agent 循环产出 **符合 Plan** 的 Outline；`revisionCountMax` 超限 **报错退出**；**无 `replan`**。

> 依赖 M4 稳定；开关：`features.outlineOrchestration`。完整规格 PRD [§3.5](./PRD.md#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)。

#### P2a — Plan API + UI（约 1 周）

- [ ] `lib/generation/curriculum-planner.ts`：`generateObject` → `CurriculumPlan`
- [ ] `POST /api/generate/curriculum-plan`、`GET/PATCH /api/courses/[id]/curriculum-plan`
- [ ] `POST .../curriculum-plan/confirm`（`plan_status=frozen`）、`POST .../replan`（解冻）
- [ ] `components/generation/PlanEditor.tsx`：`sceneSlots` 表格（draft 可编辑，frozen 只读）
- [ ] `lib/generation/plan-consistency.ts`：规则预检工具函数（供 Critic 复用）

**验收**：ingest → 生成 Plan → 编辑 → 冻结；frozen 后 PATCH 返回 403。

#### P2b — 评审循环 API + Round UI（3～4 天）

- [ ] `outline-drafter.ts`、`outline-critic.ts`、`outline-director.ts`（Director 仅 `redraft`|`approve`，Zod 校验）
- [ ] `outline-graph.ts`：LangGraph；状态含 `revisionCount`、`frozenPlan`（只读）
- [ ] `POST /api/generate/outline-from-plan`：SSE `phase` / `critic` / `director` / `outline` / `done` / `error`
- [ ] `components/generation/OutlineReviewRounds.tsx`：Round 1/2/3 卡片
- [ ] `approve` 后写入 `outlines`；进入 M2+ 助手或手改流程

**验收**：冻结 Plan 后自动循环；Critic 检出 type 不一致时 `redraft` 可修复；3 轮内 `approve`。

#### P2c — 超限失败态（2 天）

- [ ] `revisionCount >= revisionCountMax` → `courses.status = 'outline_generation_failed'`
- [ ] SSE `error` + `code: 'REVISION_LIMIT_EXCEEDED'` + 最后一版 `CriticReport`
- [ ] UI 失败页：展示报告 + 「重新规划」按钮
- [ ] 日志：`plan_version`、`revisionCount`、`directorDecision`

**验收**：故意坏 Plan + 严格 Critic 时触发失败态，不 infinite loop。

#### P2d — Eval（2 天）

- [ ] `eval/outline-orchestration/`：10 个固定 requirement，统计 3 轮内 `approve` 率
- [ ] 统计 Outline 与 `sceneSlots` 的 order/type 一致率
- [ ] README 补充 Agent 能力映射（PRD §13.10）

#### 禁止事项（Phase 2）

- ❌ Director → Planner `replan` 边
- ❌ 循环中 `ask_user` 改 Plan
- ❌ 引入 `pi-agent-core` / Postgres agent event log
- ❌ 抄 OpenMAIC 1.0 `lib/server/agent-runtime/`

#### 建议 PR 顺序

`feat(p2a): curriculum plan freeze` → `feat(p2b): outline review graph` → `feat(p2c): revision limit failure` → `feat(p2d): outline orchestration eval`

---

## 5. OpenMAIC 移植矩阵

OpenMAIC 为 **参考实现**，MindFlow 为独立仓库。下表说明各模块如何处理。


| MindFlow 目标 | OpenMAIC 参考路径                                     | 策略       | 注意点                                  |
| ----------- | ------------------------------------------------- | -------- | ------------------------------------ |
| 首页          | `app/page.tsx`                                    | 精简复制     | 持久化改 Postgres；保留 session 跳转模式        |
| 生成预览页       | `app/generation-preview/page.tsx`                 | 精简复制     | 去掉 agent-profiles、web-search 步骤      |
| 课堂页         | `app/classroom/[id]/page.tsx`                     | 精简复制     | 去掉 Pro 编辑入口                          |
| PDF 解析      | `app/api/parse-pdf/route.ts`                      | 复制逻辑     | 解析结果写 DB 而非 IndexedDB                |
| 大纲 SSE      | `app/api/generate/scene-outlines-stream/route.ts` | 复制       | MVP；Phase 2 用 `outline-from-plan` |
| 大纲 Tool 助手 | 无（OpenMAIC Pro 在 workbench）                    | **自研**   | 参考 1.0 `generation-tools.ts` **仅 tool schema**，不抄 runner |
| Plan 编排     | 无                                                | **自研**   | PRD §3.5；勿抄带 `replan` 的旧 PRD 示例 |
| 场景生成        | `scene-content` + `scene-actions` routes          | 复制       | 删除 interactive/pbl handler           |
| Director    | `lib/orchestration/director-graph.ts`             | 精简复制     | 固定 3 Agent；无白板 action                |
| Agent 循环    | `lib/chat/agent-loop.ts`                          | 精简复制     | 保留无状态多轮调用模式                          |
| 播放          | `components/stage.tsx`、`PlaybackChromeRoot.tsx`   | **重写**   | 新 `PlaybackShell`；无 TTS/Pro          |
| 设置          | `components/settings/index.tsx`                   | **大幅精简** | 仅 Key/model/embedding；无多 Provider 面板 |
| 类型          | `lib/types/generation.ts`、`lib/types/action.ts`   | 复制子集     | 去掉 interactive/pbl 字段                |
| PDF 存储      | IndexedDB `storePdfBlob`                          | **重写**   | `documents` 表 + `uploads/` 目录        |




### 禁止直接复制的目录


| 目录                 | 原因             |
| ------------------ | -------------- |
| `lib/media/`       | AI 图/视频，MVP 不做 |
| `lib/audio/`       | TTS/ASR，MVP 不做 |
| `components/edit/` | Pro 编辑器        |
| `lib/export/`      | PPTX/zip 导出    |
| `lib/server/agent-runtime/` | OpenMAIC 1.0 Pro Runtime，MindFlow 不做 |
| `lib/workbench/`   | Pro Workbench UI |
| `eval/`            | 评测框架；Phase 2d 仅加 `eval/outline-orchestration` |


---



## 6. 页面与 API 实现 Checklist



### 6.1 页面



#### 首页 `/`


| 项   | 要求                                                       |
| --- | -------------------------------------------------------- |
| 输入  | 提示词（可选）+ PDF（可选），至少一项                                    |
| 校验  | 仅提示词 ≥10 字；仅 PDF 解析后 ≥200 字                              |
| 创建  | `POST /api/courses` → `sessionStorage.generationSession` |
| 导航  | 成功 → `/generation-preview`；列表项 → `/classroom/[id]`       |
| 设置  | 顶栏打开 `SettingsDialog`                                    |




#### 生成预览页 `/generation-preview`


| 项       | 要求 |
| ------- | ---------------------------------------- |
| Session | 无 `generationSession` → 重定向 `/` |
| 布局    | 左：大纲助手（`outlineAssistant`）；右：`OutlinesEditor`（PRD §3.1.2.6） |
| 步骤    | MVP / M2+ / Phase 2 三模式见 PRD §4.2 |
| Plan    | Phase 2：`PlanEditor` draft 可编辑 → confirm 冻结 → Round UI |
| 大纲    | SSE 或 `outline-from-plan`；可手改 |
| 失败    | `outline_generation_failed` 展示 Critic + 「重新规划」 |
| 完成    | `router.push('/classroom/[id]')` |




#### 课堂页 `/classroom/[id]`


| 项   | 要求                                                   |
| --- | ---------------------------------------------------- |
| 加载  | URL `id` 查 Postgres；无数据 → 错误态                        |
| 布局  | 左场景列表 / 中渲染器 / 字幕 / 右讨论                              |
| 续生成 | 调 `generate-remaining`；列表显示 pending/generating/ready |
| 讨论  | 进行中禁用场景切换                                            |
| 设置  | 顶栏 `SettingsDialog`                                  |




### 6.2 API

完整规格见 PRD [第 7 节](./PRD.md#7-api-规格)。实施顺序建议：

1. `POST/GET /api/courses`
2. `POST /api/courses/[id]/ingest`
3. `POST /api/generate/outlines-stream`（MVP）
4. `PATCH /api/courses/[id]/outlines`
5. `POST /api/generate/scene-content` + `scene-actions`
6. `GET /api/courses/[id]`
7. `POST /api/courses/[id]/generate-remaining`
8. `POST /api/chat`
9. `POST /api/quiz/grade`

**M2+ 追加**：`GET outline-session`、`POST outline-chat`

**Phase 2 追加**：`curriculum-plan` CRUD、`confirm`/`replan`、`outline-from-plan`

SSE 事件类型见 PRD [§7.1](./PRD.md#71-sse-事件)（大纲流 / 评审流 / 助手流 / 聊天流）。

---



## 7. 数据流与联调顺序



### 7.1 创建课程 → 首屏播放

```mermaid
sequenceDiagram
  participant Home as HomePage
  participant API as API
  participant Preview as GenerationPreview
  participant Ing as Ingest
  participant DB as Postgres
  participant Class as Classroom

  Home->>API: POST /api/courses
  API->>DB: insert course
  API-->>Home: courseId
  Home->>Preview: sessionStorage + navigate

  alt hasPDF
    Preview->>API: POST /courses/id/ingest
    API->>Ing: chunk + embed
    Ing->>DB: chunks, embeddings
  end

  Preview->>API: POST /generate/outlines-stream
  API-->>Preview: SSE outlines
  Preview->>API: scene-content + scene-actions
  API->>DB: insert scene_1
  Preview->>Class: router.push /classroom/id
```





### 7.2 课堂讨论（RAG）

```mermaid
sequenceDiagram
  participant User as User
  participant Panel as DiscussionPanel
  participant API as API_chat
  participant RAG as retrieve
  participant G as LangGraph

  User->>Panel: send message
  Panel->>API: POST /api/chat
  alt has_knowledge_base
    API->>RAG: retrieve query courseId
    RAG-->>API: SourceRef[]
  end
  API->>G: director + agent_generate
  G-->>API: SSE text
  API-->>Panel: message + sources
```





### 7.3 推荐联调顺序

**先后端、再页面**，避免前后端同时改动难以定位问题：

1. M0：`courses` API + DB
2. M1：ingest + retrieve + chat（可用 curl / Postman）
3. M2：outlines-stream → scene 生成 API → 再挂三页
4. M3：quiz API → Director chat → DiscussionPanel
5. M4：generate-remaining → SettingsDialog → 端到端
6. **M2+**：outline-tools → outline-chat → preview 侧栏
7. **P2a～P2d**：Plan 冻结 → outline-graph → 失败态 → eval

---



## 8. 本地开发工作流



### 8.1 日常命令

```bash
# 启动数据库
docker compose up -d db

# 同步 schema
pnpm drizzle-kit push

# 开发服务器
pnpm dev
```

访问 `http://localhost:3000`。

### 8.2 三条 Happy Path 手动测试


| #   | 路径        | 操作                                     |
| --- | --------- | -------------------------------------- |
| A   | 仅提示词      | 输入「用 20 分钟讲 React Hooks」→ 生成 → 课堂 → 讨论 |
| B   | 仅 PDF     | 上传教材 PDF → 生成 → 课堂 → 讨论（应有引用）          |
| C   | 提示词 + PDF | 输入教学目标 + 上传 PDF → 生成 → 课堂 → 讨论         |




### 8.3 日志与可观测性

每条生成/讨论请求记录（PRD 10 节）：

```
courseId=... sceneId=... retrieveMs=42 tokenUsage=1234 plan_version=1 revisionCount=2 directorDecision=redraft
```



### 8.4 可选单测（Vitest）


| 模块                          | 测试点                                |
| --------------------------- | ---------------------------------- |
| `lib/knowledge/chunk.ts`    | 分块边界、overlap、page 元数据              |
| `lib/knowledge/retrieve.ts` | `course_id` 过滤、topK                |
| 大纲解析                        | partial JSON → `SceneOutline` 增量解析 |
| `lib/playback/pacing.ts`    | 阅读时长估算                             |
| `lib/generation/plan-consistency.ts` | order/type 规则预检（P2） |
| `lib/generation/outline-graph.ts` | revision 超限终止（P2） |


```bash
pnpm add -D vitest
pnpm vitest run
```

---



## 9. 验收与演示清单



### 9.1 成功指标（PRD 1.5）

- [ ] 仅提示词 → 首屏可播放 < 2 分钟（视模型）
- [ ] 仅 PDF → 首屏可播放 < 3 分钟（含 ingest）
- [ ] 提示词 + PDF → 首屏可播放 < 3 分钟
- [ ] 有 PDF 时 RAG 回答含引用 > 80% 讨论轮次
- [ ] 课程生成完成率 > 90%（slide + quiz 全页）
- [ ] 无 Pro 编辑亦可完整走通



### 9.2 用户故事

- [ ] **US-01** 仅提示词生成完整课程
- [ ] **US-01b** 仅 PDF 自动生成课程结构
- [ ] **US-01c** 提示词 + PDF 组合
- [ ] **US-02** 流式大纲列表
- [ ] **US-03** 可修改/确认大纲
- [ ] **US-03a** Phase 2：编辑并冻结 Plan
- [ ] **US-03b** Phase 2：冻结后 Agent 产出符合 Plan 的大纲
- [ ] **US-03c** M2+：对话式微调大纲
- [ ] **US-04** 首屏完成即进入课堂
- [ ] **US-05** 观看幻灯片与讲稿字幕
- [ ] **US-06** 课堂中向 Agent 提问
- [ ] **US-07** 有 PDF 时看到引用片段
- [ ] **US-07b** 无 PDF 时仍可讨论
- [ ] **US-08** quiz 场景可答题



### 9.3 演示录屏分镜（约 3 分钟）


| 时间        | 画面                               |
| --------- | -------------------------------- |
| 0:00–0:30 | 首页：输入提示词 + 上传 PDF，点击生成           |
| 0:30–1:00 | generation-preview：流式大纲、确认       |
| 1:00–1:30 | 进入 classroom：播放 slide 字幕         |
| 1:30–2:00 | 切换到 quiz 页答题                     |
| 2:00–2:30 | 讨论区提问，展示 RAG 引用来源                |
| 2:30–3:00 | 展示课程列表、SettingsDialog、README 架构图 |


---



## 10. 常见问题与 Phase 2 入口



### 10.1 排错表


| 现象                    | 可能原因                                 | 处理                                    |
| --------------------- | ------------------------------------ | ------------------------------------- |
| 大纲 JSON 解析失败          | LLM 输出非标准 JSON                       | `jsonrepair` + 最多 2 次重试               |
| 仅 PDF 主题漂移            | 未确认 title/languageDirective          | ingest 后先展示摘要让用户确认                    |
| RAG 无引用               | `has_knowledge_base=false` 或 topK 过低 | 检查 ingest 状态；调 chunk/overlap          |
| 跨课程内容泄漏               | retrieve 未过滤 `course_id`             | 强制 WHERE `course_id = $id`            |
| 首屏超时                  | 模型慢或 prompt 过长                       | 缩短 pdfExcerpt；换更快模型                   |
| generation-preview 空白 | session 丢失                           | 检查 `sessionStorage`；无 session 重定向 `/` |
| Chat 多实例状态错乱          | 服务端存了 session                        | 改无状态：客户端带全量 `messages`                |
| Phase 2 循环不停止           | 未检查 `revisionCountMax`              | Director 仅 redraft/approve；超限抛 `RevisionLimitExceeded` |
| 冻结后仍能改 Plan            | 未校验 `plan_status`                   | PATCH plan 403；UI 只读 + 「重新规划」          |
| 大纲助手改了 type 与 Plan 冲突 | 策略 A 预期行为                          | 确认前可选 `planDriftWarning`，不阻断            |




### 10.2 Phase 2 / M2+ 入口

以下能力 **不在 MVP（M0～M4）必交范围**。

#### M2+ — 大纲编辑助手

- PRD [§3.1.2](./PRD.md#312-大纲编辑助手m2非独立-agent-系统)
- 开关：`features.outlineAssistant`
- 实施：见本文 [M2+ 节](#m2--大纲编辑助手34-天)

#### Phase 2 — 冻结 Plan + 评审闭环

- PRD [§3.5](./PRD.md#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)
- **定稿要点**：用户确认后 Plan **冻结**；Director **仅** `redraft` | `approve`；**无 `replan`**；超限 **报错退出**
- 开关：`features.outlineOrchestration`、`revisionCountMax`
- 实施顺序：**P2a**（Plan API）→ **P2b**（outline-graph + UI）→ **P2c**（失败态）→ **P2d**（eval）

其他 Backlog 见 PRD [§13.7](./PRD.md#137-phase-2--m2-backlog摘录)。

---



## 相关文档

- [PRD.md](./PRD.md) — 产品需求 v1.4、数据模型、API
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 模块划分、三轨生成域、时序图（v1.2）

---

*文档版本：v1.2 | 2026-09-07 | 对齐 PRD v1.4（冻结 Plan、M2+ 助手、P2a～P2d）*