根据四份文档整理的**全量 API 清单**与**核心数据结构**。API 路径以 PRD §7 为准（`/api/stages`）；DEV_GUIDE 里部分仍写 `/api/courses`，实现时统一用 **`stages`**。

> **仓库现状**：早期用于测 RAG 的 `POST /api/chat`（JSON `{ stageId, messages }` → `{ text, sources }`）**已删除**，文档与联调清单中不再作为已实现端点。M2+/M3 的 SSE `/api/chat` 仍见 PRD §7，**待 M3/M2+ 新建实现**。

---

# 一、API 总览（16 个 HTTP 端点 + 1 个客户端续生成）

## 1. 课堂 / Stage（M0）

| 方法 | 路径 | 说明 | 阶段 |
|------|------|------|------|
| `POST` | `/api/stages` | 创建课堂：`requirement`（必填，≥10 字符）+ 可选 `pdf?`（multipart） | M0 |
| `GET` | `/api/stages` | 课堂列表 | M0 |
| `GET` | `/api/stages/[id]` | 详情：`sceneOutlines`、`previewPhase`、`outlines`、`scenes` 状态 | M0/M2 |
| `PATCH` | `/api/stages/[id]` | 更新 `sceneOutlines` / `previewPhase`；Phase 2 冻结 Plan 时写 `outlineConfirmedAt` | M2/P2 |
| `GET` | `/api/health` | 健康检查 `{ ok, db }` | M0 |

## 2. RAG / PDF（M1）

| 方法 | 路径 | 说明 | 阶段 |
|------|------|------|------|
| `POST` | `/api/stages/[id]/ingest` | PDF 解析 → 分块 → embedding 入库；无文档 400 | M1 |
| `POST` | `/api/parse-pdf` | 对齐 OpenMAIC 的 PDF 解析（可独立调） | M1 |

> **`retrieve`** 不是 HTTP API，是 `lib/knowledge/retrieve.ts` 内部函数；在 **M3 课堂讨论**与**大纲生成（有 KB）**时由服务端调用。M1 仅验收 ingest + 向量写入，不要求 chat HTTP。

## 3. 大纲生成与编辑（M2 / M2+ / Phase 2）

| 方法 | 路径 | 说明 | 阶段 |
|------|------|------|------|
| `POST` | `/api/generate/scene-outlines-stream` | SSE 流式大纲；Phase 2 body 加 `outlineOrchestration` + `phase: 'plan' \| 'execute'` | M2/P2 |
| `PATCH` | `/api/stages/[id]/outlines` | 原子 PATCH `stage.outlines` JSONB（手改 / Tool / approve） | M2 |
| `POST` | `/api/stages/[id]/outlines/confirm` | 确认执行稿大纲 → `outlines_status=confirmed` → 触发 scene 生成 | M2 |
| `POST` | `/api/stages/[id]/replan` | Phase 2：解冻 Plan，回到阶段 A | P2 |

## 4. Scene 生成（M2 / M4）

| 方法 | 路径 | 说明 | 阶段 |
|------|------|------|------|
| `POST` | `/api/generate/scene-content` | 单页幻灯片/quiz **内容**生成 | M2 |
| `POST` | `/api/generate/scene-actions` | 单页 **讲稿 actions** + 组装 scene 写入 DB | M2 |

**无独立续生成 API**：课堂页用客户端 `useSceneGenerator().generateRemaining`，内部反复调 `scene-content` + `scene-actions`。

## 5. 对话 / 讨论（规划：M3 / M2+，当前仓库未实现 `/api/chat`）

| 方法 | 路径 | 说明 | 阶段 |
|------|------|------|------|
| `POST` | `/api/chat` | 统一对话入口（SSE）：课堂 qa/discussion 多 Agent；M2+ `sessionType: 'outline'` 大纲助手 + Tool | **M3 / M2+**（规格见 PRD §7） |
| `GET` | `/api/stages/[id]/chat-sessions` | 获取会话及历史；query `sessionType=outline`（qa 可对称扩展） | M2+ |
| `POST` | `/api/quiz-grade` | 简答题 LLM 批改 `{ question, userAnswer, points, ... }` | M3 |

---

## API 按用户旅程分组

```
首页
  POST /api/stages
  GET  /api/stages
  GET  /api/health

生成预览页
  POST /api/stages/[id]/ingest          （有 PDF）
  POST /api/generate/scene-outlines-stream
  PATCH /api/stages/[id]/outlines       （手改）
  POST /api/stages/[id]/outlines/confirm
  POST /api/chat（sessionType: outline）  （M2+ 助手）
  GET  /api/stages/[id]/chat-sessions?sessionType=outline
  PATCH /api/stages/[id]                （P2 编辑/冻结 Plan）
  POST /api/stages/[id]/replan          （P2）

课堂页
  GET  /api/stages/[id]                 （加载 + 轮询续生成状态）
  POST /api/generate/scene-content      （续生成，客户端 hook 调用）
  POST /api/generate/scene-actions
  POST /api/chat                        （qa / discussion）
  POST /api/quiz-grade                  （简答批改）
```

---

## SSE 事件类型（`/api/chat` 与 `scene-outlines-stream`）

| 流 | 主要 `type` |
|----|-------------|
| 大纲流 | `phase`, `languageDirective`, `outline`, `done`, `error`, `retry` |
| Phase 2 评审流 | `phase`, `outline`, `critic`, `director`, `done`, `error` |
| 大纲助手 | `text_delta`, `tool_start`, `tool_end`, `outlines_updated`, `done`, `error` |
| 课堂聊天 | `thinking`, `agent_start`, `text_delta`, `agent_end`, `sources`, `cue_user`, `done`, `error` |

---

# 二、核心数据结构

## 1. 数据库（6 张表）

### `stage` — 课堂根实体

| 字段 | 类型/枚举 | 说明 |
|------|-----------|------|
| `id` | uuid | PK |
| `name`, `description` | text | 课程标题/描述 |
| `requirement` | text | 用户提示词 |
| `language_directive` | text | 授课语言指令 |
| `has_knowledge_base` | boolean | RAG 开关 |
| `status` | 见下 | 生成流水线状态 |
| `preview_phase` | `preparing` \| `outline-ready` \| `review` \| `generating-content` | 预览页阶段 |
| `outlines` | jsonb | 执行稿 `SceneOutline[]`（L1） |
| `outlines_status` | `draft` → `confirmed` → `scenes_ready` → `archived` | 大纲生命周期 |
| `scene_outlines` | jsonb? | Phase 2 Plan 蓝图 |
| `outline_confirmed_at` | timestamptz? | Plan 冻结时间 |
| `generation_session_id` | int | 重新规划递增 |
| `last_critic_report` | jsonb? | P2 失败展示 |
| `current_scene_id` | uuid? | M4 播放/续生成指针 |
| `agent_ids` | jsonb? | M3 讨论 Agent |

**`stage.status`**：`draft` → `ingesting` → `outline_generating` → `outline_ready` →（P2: `plan_frozen` / `outline_reviewing`）→ `outline_confirmed` → `scene_generating` → `ready` / `outline_generation_failed` / `error`

### `scenes` — 已生成页（L2 播放终态）

| 字段 | 说明 |
|------|------|
| `outline_id` | text，逻辑关联 `stage.outlines[].id`（非 FK） |
| `sort_order` | 页序 |
| `type` | `slide` \| `quiz` |
| `title` | 场景标题 |
| `content` | jsonb，幻灯片/quiz 画面 |
| `actions` | jsonb，播放时间线（speech / discussion 等） |
| `status` | `pending` \| `generating` \| `ready` \| `failed` |

### `documents` — PDF 元数据

`filename`, `page_count`, `raw_text`, `storage_path`, `stage_id`

### `chunks` — RAG 分块 + 向量

`content`, `page`, `chunk_index`, `metadata`, `embedding vector(1536)`, `stage_id`, `document_id`

### `chat_sessions` — 会话壳

| 字段 | 说明 |
|------|------|
| `session_type` | `qa` \| `discussion` \| `lecture` \| `outline` |
| `scene_id` | 可选绑定当前页 |
| `status` | `idle` \| `active` \| `completed` \| `error` |
| `config` | `{ agentIds, triggerAgentId, defaultAgentId }` |
| `last_action_index` | lecture 讲稿进度 |

### `chat_messages` — 消息行

| 字段 | 说明 |
|------|------|
| `role` | `user` \| `assistant` \| `system` |
| `content` | 正文 |
| `agent_id` | 多 Agent 气泡（teacher / student-a / student-b） |
| `sources` | RAG 引用 `SourceRef[]` |
| `metadata` | Tool 元数据 `{ toolName, toolArgs, outlineId }` |

**ER**：`stage` 1→N `documents/chunks/scenes/chat_sessions`；`chat_sessions` 1→N `chat_messages`；`scenes.outline_id` → `outlines[].id`（逻辑）。

---

## 2. 核心 JSON 类型（不入独立表）

### `SceneOutline`（`stage.outlines` / `stage.scene_outlines` 数组元素）

```typescript
{
  id: string;
  type: "slide" | "quiz";
  title: string;
  description: string;
  keyPoints: string[];
  order: number;
  teachingObjective?: string;
  estimatedDuration?: number;
  languageNote?: string;
  quizConfig?: { questionCount, difficulty, questionTypes };
  suggestedImageIds?: string[];  // 有 PDF 时
}
```

### `OutlinePatchRequest`（`PATCH /outlines`）

`replace` | `revise` | `insert` | `delete` | `reorder`（见 PRD §6.3）

### Scene `content`（slide 示例）

`elements[]`（文本/布局）+ `background`；quiz 为 `questions[]`（`single` / `text` 等）

### Scene `actions`（播放时间线）

```typescript
{ id, type: "speech", text: string }
{ id, type: "discussion", topic: string, agentId?: string }
// MVP 其他 action 类型可 no-op
```

### `SourceRef`（RAG 引用）

```typescript
{ chunkId: string; page?: number; excerpt: string; score?: number }
```

### `/api/chat` 请求体（**规划 M3/M2+**，当前无路由；对齐 OpenMAIC）

```typescript
{
  messages: UIMessage[];
  storeState: { stage, scenes, currentSceneId, mode };
  directorState?: DirectorState;   // 课堂讨论轮次，不入库
  config: {
    sessionType?: "qa" | "discussion" | "outline";
    agentIds: string[];
    triggerAgentId?: string;
  };
  // stageId 用于 RAG 过滤
}
```

### 固定 Agent（`config/agents.json`，不建表）

`id`, `name`, `role`, `persona`, `avatar`, `color`, `priority`  
默认：`teacher`, `student-a`, `student-b`

---

## 3. 非数据库存储（三态模型）

| 层级 | 位置 | 内容 |
|------|------|------|
| **L0** | `sessionStorage.generationSession` + 前端 state | SSE 流式中间态、未确认手改 |
| **L1** | `stage.outlines` / `stage.scene_outlines` JSONB | Plan / 执行稿工作副本 |
| **L2** | `scenes` 表 | 课堂播放终态 |

| 其它 | 存放 |
|------|------|
| Quiz 作答进度 | `localStorage` |
| API Key / 模型配置 | `SettingsDialog` → `localStorage` → 生成用 Chat 头三件套 / RAG 用 Embedding 头三件套（见 [LLM-IMPLEMENTATION.md](./LLM-IMPLEMENTATION.md) v2.3） |
| Feature 开关 | `lib/config/features.ts` |
| Director 运行时状态 | 请求体 `directorState`（无状态 API） |

---

## 4. 生成流水线数据流（记一张图即可）

```
POST /api/stages
  → ingest? → scene-outlines-stream → stage.outlines (L1)
  → PATCH outlines / chat outline助手?
  → POST outlines/confirm
  → scene-content → scene-actions → scenes (L2)
  → classroom: GET stages/[id] + generateRemaining + /api/chat + /api/quiz-grade
```

---

## 5. 里程碑与 API 对应

| 里程碑 | 主要 API |
|--------|----------|
| **M0** | `POST/GET /api/stages`, `GET /health` |
| **M1** | `ingest`（RAG 管道；无 chat HTTP） |
| **M2** | `scene-outlines-stream`, `PATCH outlines`, `outlines/confirm`, `scene-content/actions` |
| **M2+** | `GET chat-sessions`, `/api/chat`（outline + Tool） |
| **M3** | `/api/chat`（Director 3 Agent）, `quiz-grade` |
| **M4** | `generateRemaining`（客户端）, 轮询 `GET stages/[id]` |
| **Phase 2** | `scene-outlines-stream`（plan/execute）, `PATCH stages/[id]`, `replan` |

---

如果你要落地实现，建议以 PRD §7 的 **`/api/stages`** 路径建路由表，把 DEV_GUIDE 里残留的 `courses` 当作旧称即可。需要的话我可以再出一版「仅 MVP（M0～M4）」的精简清单，方便你对照 `schema.prisma` 逐项实现。