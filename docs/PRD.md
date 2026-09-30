# MindFlow 产品需求文档（PRD）

**产品全称**：MindFlow — AI 知识库驱动的互动课堂生成系统  
**版本**：v2.1  
**状态**：MVP 定义（含 M2+ 大纲助手、Phase 2 冻结 Plan 编排规格）  
**最后更新**：2026-09-21  

---

## 目录

- [修订记录](#修订记录)
- [1. 产品概述](#1-产品概述)
- [2. 用户故事与核心流程](#2-用户故事与核心流程)
- [3. 功能范围](#3-功能范围)
  - [3.1.1 生成流水线策略（MVP 固定流程 → Phase 2 可切换）](#311-生成流水线策略mvp-固定流程--phase-2-可切换)
  - [3.1.2 大纲编辑助手（M2+，非独立 Agent 系统）](#312-大纲编辑助手m2非独立-agent-系统)
  - [3.5 Phase 2 拓展：冻结 Plan + 大纲评审闭环（非 MVP）](#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)
- [4. 信息架构与页面](#4-信息架构与页面)
- [5. 技术架构](#5-技术架构)（设计原则、分层、目录、模块、时序、部署）
- [6. 数据模型](#6-数据模型)
- [7. API 规格](#7-api-规格)
- [8. RAG 规格](#8-rag-规格)
- [9. 播放模块](#9-播放模块)
- [10. 非功能需求](#10-非功能需求)
- [11. 里程碑](#11-里程碑)
- [12. 风险与缓解](#12-风险与缓解)
- [13. 附录](#13-附录)

相关文档：[DEV_GUIDE.md](./DEV_GUIDE.md)（v1.2，实施手册） · [DATA-MODEL.md](./DATA-MODEL.md)（数据模型定稿） · [LLM-IMPLEMENTATION.md](./LLM-IMPLEMENTATION.md)（v2.3，LLM 双链路 + stages 输入） · [ARCHITECTURE-data.md](./ARCHITECTURE-data.md)（OpenMAIC 数据结构全景）

---

## 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-09-02 | 初稿：MVP 范围、双通道输入、Postgres+pgvector、slide+quiz |
| v1.1 | 2026-09-02 | 路由对齐 OpenMAIC：`/`、`/generation-preview`、`/classroom/[id]`；设置改为 `SettingsDialog` 组件；新增 [DEV_GUIDE.md](./DEV_GUIDE.md) |
| v1.2 | 2026-09-02 | 新增 Phase 2 规格：大纲多 Agent 编排（Planner → Drafter → Critic → Director 自主循环） |
| v1.3 | 2026-09-07 | 明确 MVP 固定生成流水线及 `outlineOrchestration` 切换策略（[3.1.1 节](#311-生成流水线策略mvp-固定流程--phase-2-可切换)） |
| v1.4 | 2026-09-07 | 定稿生成域三阶段：冻结 Plan → Agent 评审循环 → 大纲编辑助手 |
| v1.5 | 2026-09-08 | **命名对齐 OpenMAIC 0.2.x**：API/类型/模块名与 `lib/types/generation.ts`、`scene-outlines-stream`、`use-scene-generator` 等一致；见 [§13.11](#1311-openmaic-命名对齐表) |
| v1.6 | 2026-09-08 | **数据模型定稿**：6 张表（`stage` / `scenes` / `chat_sessions` / `chat_messages` / `documents` / `chunks`）；大纲存 `stage.outlines` / `stage.scene_outlines` JSONB，**不建** `outlines` / `agents` / `chunk_embeddings` 表；API 根路径统一为 `/api/stages`；详见 [§6](#6-数据模型) 与 [DATA-MODEL.md](./DATA-MODEL.md) |
| v1.7 | 2026-09-08 | **大纲与 Plan 生命周期定稿**：三态存储（sessionStorage → stage JSONB 工作副本 → scenes 终态）；SSE `done` 后落库；scene 全 `ready` 后默认保留 `outlines`；见 [§6.1.4](#614-大纲与-plan-生命周期) |
| v1.8 | 2026-09-19 | **输入策略**：创建课堂时 `requirement` **必填**（≥10 字符），`pdf` **可选**；取消「仅 PDF、无提示词」产品路径；见 [§1.6](#16-输入模式必填提示词--可选-pdf) |
| v1.9 | 2026-09-19 | **架构并入 PRD**：原独立架构说明整理进 [§5](#5-技术架构)；删除 `docs/ARCHITECTURE.md` |
| v2.0 | 2026-09-20 | **LLM 与创建输入**：LLM 仅 `X-Mindflow-Llm-*` 请求头、无服务端 LLM `.env` 兜底；`POST /api/stages` 嵌套 `requirements`（见 [LLM-IMPLEMENTATION.md](./LLM-IMPLEMENTATION.md) v2.0）；[§5.10](#510-环境与配置)、[§8.1](#81-ingest) 对齐 |
| v2.1 | 2026-09-21 | **LLM 双链路**：`requireChatModel`（`lib/ai`）与 `requireEmbeddingModel`（`lib/knowledge`）；废弃 `requireLlmModels` 四头合一；[§5.1](#51-设计原则) 原则 6、[§5.6](#56-核心模块) knowledge 表 |

---

## 1. 产品概述

### 1.1 一句话描述

MindFlow 允许用户通过 **必填的课程提示词** 创建课程，并可 **可选上传 PDF** 作为知识库；系统自动生成结构化互动课程（幻灯片 + 测验），在课堂中通过多 Agent 讨论进行问答。**无 PDF 时由 LLM 按 requirement 生成；有 PDF 时在 ingest 后大纲与讨论可叠加 RAG 引用原文。**

### 1.2 目标用户

| 用户类型 | 场景 |
|----------|------|
| 自学者 | 输入「我想学 XX」直接生成课；有教材 PDF 时附带 RAG 问答 |
| 教师/培训者 | 提示词定教学目标 + 可选上传讲义 PDF 生成带测验课程 |
| 开发者（简历/demo） | 展示全栈 + LLM + Agent + RAG 能力 |

### 1.3 与 OpenMAIC 的关系

- **架构借鉴**：大纲 → 场景内容 → 动作脚本 两阶段生成；LangGraph Director 多 Agent 讨论；SSE 流式大纲；Phase 2 **冻结 Plan + Critic 评审闭环**；M2+ **AI SDK Tool 大纲编辑助手**。
- **非 fork 声明**：MindFlow 为独立产品，实现代码与仓库独立；参考开源课堂类产品的流水线设计，不照搬 OpenMAIC Pro Agent Runtime。
- **刻意不做**：Pro 编辑、TTS/ASR、AI 图视频、interactive/PBL、复杂 Roundtable、多 Provider 配置面板等（见 [3.4 节](#34-明确不做mvp--第二期)）。

### 1.4 产品目标（MVP）

1. **无附加 PDF** 或 **提示词 + 可选 PDF**，均可在 **10 分钟内** 得到可播放的首屏课程。
2. 用户上传 PDF 时，讨论回答 **应优先引用** 文档片段（RAG）；无 PDF 时基于课程内容与提示词回答，并明确标注「无文档引用」。
3. 固定 3 个 Agent 角色可完成基础多轮课堂讨论。
4. 数据持久化在 **PostgreSQL + pgvector**，支持部署与演示。

### 1.5 成功指标（MVP）

| 指标 | 目标 |
|------|------|
| 无附加 PDF → 首屏可播放 | < 2 分钟（视模型） |
| 含 PDF（含 ingest）→ 首屏可播放 | < 3 分钟（含 ingest） |
| RAG 回答含引用（有 PDF 时） | > 80% 讨论轮次展示 source |
| 课程生成完成率 | > 90%（slide + quiz 全页） |
| 核心路径可用性 | 无 Pro 编辑亦可完整走通 |

### 1.6 输入模式（必填提示词 + 可选 PDF）

**总则**：创建课堂时 **`requirement` 必填**；**`pdf` 可选**。与 OpenMAIC 一致：`UserRequirements.requirement` 为自由文本，PDF 为可选素材。

| 模式 | 提示词 | PDF | 生成依据 | 讨论 / RAG |
|------|--------|-----|----------|------------|
| **A. 无附加 PDF** | 必填 | 无 | LLM 根据 `requirement` 推断主题、结构、讲稿 | 无向量检索；上下文 = requirement + 当前 scene + 聊天 |
| **B. 提示词 + PDF** | 必填 | 可选 | `requirement` 定教学目标与风格；PDF 作事实素材 | 有 PDF 且 ingest 后：RAG；大纲生成叠加 retrieve / 摘要 |

**校验规则（MVP）**：

- `requirement`：trim 后 **≥ 10 字符**（`application/json` 与 `multipart/form-data` 的 `requirement` 字段一致）。
- `pdf`：可选；若提供则须为有效 PDF、≤50MB；创建时 **只落盘**，不解析。
- **ingest**：仅当该 stage 有关联 `documents` 时调用；解析后去空白字符 **≥ 200**（否则 400，提示更换 PDF 或检查扫描件）。
- 有大纲 / 讨论时：始终以 `requirement` 为主；`has_knowledge_base=true` 时叠加 RAG。

**与 OpenMAIC 对齐**：必填 `requirement` + 可选 `pdfText`（本项目 PDF 经 ingest 进入 chunks，而非仅客户端传全文）。

**文档与实现差异（v1.8）**：产品规格以本节为准。当前仓库 `lib/services/stages.ts` 仍可能接受「仅 PDF、空 requirement」创建；后续实现 PR 应对齐本节（含 `name` 一律由 requirement 推导，不再用文件名作主标题）。

---

## 2. 用户故事与核心流程

### 2.1 主流程（Happy Path）

> **MVP 主路径**（单次大纲 SSE → 确认 → 首屏 → 课堂）。下图按页面分阶段，标注每步 **API**、**主要数据结构读写** 与 **存储层级**（L0 `sessionStorage` → L1 `stage` JSONB → L2 `scenes`，见 [§6.1.4](#614-大纲与-plan-生命周期)）。与 [§5.7 核心数据流](#57-核心数据流)、[§7 API 规格](#7-api-规格) 一一对应。M2+ 大纲助手为可选分支；Phase 2 完整生成域见 [§2.1.1](#211-完整生成域流程m2--phase-2-定稿)。

```mermaid
flowchart TD
  subgraph home [首页]
    S1["S1 创建课堂<br/>API: POST /api/stages<br/>写: stage, documents?<br/>层级: DB"]
    S1b["S1b 写入会话并跳转<br/>API: 前端 router.push<br/>写: sessionStorage.generationSession<br/>层级: L0"]
  end

  subgraph preview [生成预览页]
    S2["S2 进入预览页<br/>API: 读 sessionStorage<br/>读: L0 generationSession<br/>缺失则重定向 /"]
    pdfGate{有PDF?}
    S3["S3 PDF入库<br/>API: POST /api/stages/id/ingest<br/>写: chunks, embedding<br/>更新: has_knowledge_base=true"]
    S4["S4 SSE生成大纲<br/>API: POST /api/generate/scene-outlines-stream<br/>流式: 仅L0; done写 stage.outlines<br/>outlines_status=draft, 层级: L0→L1"]
    S5opt["S5 审查手改大纲 可选<br/>API: PATCH .../outlines<br/>M2+: POST /api/chat outline<br/>层级: L1"]
    S6["S6 确认大纲<br/>API: POST .../outlines/confirm<br/>写: outlines_status=confirmed<br/>触发 scene 生成"]
    S7["S7 生成首屏Scene<br/>API: scene-content + scene-actions<br/>写: scenes outline_id content actions<br/>status=ready, sort_order=1, 层级: L2"]
  end

  subgraph classroom [课堂页]
    S8["S8 进入课堂<br/>API: GET /api/stages/id<br/>读: stage + scenes<br/>拼左侧列表 outlines+status"]
    S9["S9 后台续生成<br/>API: generateRemaining hook<br/>内部 scene-content + scene-actions<br/>写: 其余scenes; outlines_status=scenes_ready"]
    S10["S10 播放讲稿字幕<br/>API: 无<br/>读: scenes.actions speech.text<br/>播放状态: 前端"]
    S12["S12 Quiz简答批改<br/>API: POST /api/quiz-grade<br/>作答进度: localStorage<br/>批改结果: 仅响应"]
    kbGate{has_knowledge_base?}
    S11a["S11 用户提问 有RAG<br/>API: POST /api/chat qa<br/>内部 retrieve→chunks<br/>写: chat_messages+sources"]
    S11b["S11 用户提问 无RAG<br/>API: POST /api/chat qa<br/>读: storeState 当前scene<br/>写: chat_messages"]
  end

  S1 --> S1b --> S2
  S2 --> pdfGate
  pdfGate -->|是| S3 --> S4
  pdfGate -->|否| S4
  S4 --> S6
  S4 -.->|outlineAssistant 可选| S5opt
  S5opt -.-> S6
  S6 --> S7 --> S8
  S8 --> S9
  S8 --> S10
  S10 --> S12
  S10 --> kbGate
  kbGate -->|是| S11a
  kbGate -->|否| S11b
```

#### 逐步对照表

| 步骤 | 页面 | API / 调用 | 主要数据结构 | 读写 | 层级 |
|------|------|------------|--------------|------|------|
| S1 | `/` | `POST /api/stages` | `stage`（`name`, `requirement`, `status=draft`）；有 PDF 则 `documents` + `uploads/` | 写 | DB |
| S1b | `/` → `/generation-preview` | 前端 `router.push` | `sessionStorage.generationSession` = `{ stageId, requirement, ... }` | 写 | L0 |
| S2 | `/generation-preview` | 读 `sessionStorage` | `generationSession` | 读 | L0 |
| S3 | `/generation-preview` | `POST /api/stages/[id]/ingest` | `chunks` + `embedding`；`stage.has_knowledge_base=true` | 写 | DB |
| S4 | `/generation-preview` | `POST /api/generate/scene-outlines-stream` | 流式中 `SceneOutline[]`（L0）；`done` 后 `stage.outlines`, `language_directive`, `outlines_status=draft` | 写 | L0→L1 |
| S5（可选） | `/generation-preview` | `PATCH /api/stages/[id]/outlines`；M2+ `POST /api/chat`（`sessionType: outline`） | `stage.outlines`；`chat_sessions` / `chat_messages`（outline） | 更新 | L1 |
| S6 | `/generation-preview` | `POST /api/stages/[id]/outlines/confirm` | `outlines_status=confirmed` | 更新 | L1 |
| S7 | `/generation-preview` | `POST /api/generate/scene-content` → `POST /api/generate/scene-actions` | `scenes`：`outline_id`, `content`, `actions`, `status=ready`, `sort_order=1` | 写 | L2 |
| S8 | `/classroom/[id]` | `GET /api/stages/[id]` | `stage` + `scenes[]`；左侧列表 = `outlines` + `scenes.status` | 读 | DB→前端 |
| S9 | `/classroom/[id]` | `useSceneGenerator().generateRemaining`（无独立 HTTP API；内部重复 content+actions） | 其余 `scenes`；全部 ready 后 `outlines_status=scenes_ready` | 写 | L2 + L1 |
| S10 | `/classroom/[id]` | 无 | `scenes.actions[]` 当前 `speech.text`；播放索引在客户端 | 读 | 前端 |
| S11 | `/classroom/[id]` | `POST /api/chat`（`sessionType: qa`）；有 KB 时服务端内部 `retrieve(stageId, query)` | `storeState`（stage/scenes/currentSceneId）；`chat_messages`（含 `sources` / `agent_id`） | 读+写 | DB + 前端 |
| S12 | `/classroom/[id]` | `POST /api/quiz-grade`（仅简答题型） | Quiz 作答进度 `localStorage`；`scenes.content.questions` 为题目源 | 读 | 前端 |

> **S9 与 S10 并行**：进入课堂后即可播放首屏，续生成在后台进行，互不阻塞。

#### 核心类型速查

| 类型 / 存储 | 定义位置 | 用途 |
|-------------|----------|------|
| `SceneOutline` | [§13.1](#131-sceneoutline-类型mvp-子集) | `stage.outlines[]` 数组元素；大纲列表与 `scenes.outline_id` 逻辑关联 |
| `Scene.content` / `Scene.actions` | [§13.3](#133-slide-场景-content--actions-示例片段) | `scenes` 表 JSONB；幻灯片画面与播放时间线（讲稿字幕） |
| `SourceRef` | [§8.4](#84-sourceref-结构) | `chat_messages.sources`；讨论区「参考来源」展示 |
| `sessionStorage.generationSession` | [§6.1.4](#614-大纲与-plan-生命周期) | L0 草稿；SSE 流式中间态在 `done` 前不写 DB |

### 2.1.1 完整生成域流程（M2+ / Phase 2 定稿）

> MVP 仅覆盖 §2.1 主流程（单次大纲 SSE）；下图为 **M2+ 大纲助手** 与 **Phase 2 冻结 Plan 编排** 启用后的完整链路。

```mermaid
flowchart TD
  ingest[ingest有PDF]
  planGen[Planner生成sceneOutlines（蓝图）]
  planEdit[用户编辑Plan表格]
  planFreeze[确认Plan冻结]
  agentLoop[Drafter→Critic→Director循环]
  loopFail{revisionCount超限}
  loopOk[approve写入outlines]
  assistant[大纲编辑助手可选]
  manualEdit[手改OutlinesEditor]
  confirmOutline[确认大纲]
  genScenes[scene生成]
  classroom[classroom讨论]

  ingest --> planGen --> planEdit --> planFreeze --> agentLoop
  agentLoop --> loopFail
  agentLoop --> loopOk
  loopFail -->|报错退出| planEdit
  loopOk --> assistant --> manualEdit --> confirmOutline --> genScenes --> classroom
```

**阶段划分**：

| 阶段 | 名称 | 驱动方 | 产出 |
|------|------|--------|------|
| A | Plan 规划 | Planner + **用户手改** | `sceneOutlines（蓝图）`（确认后 **冻结**） |
| B | 大纲评审循环 | **Agent 自主**（Plan 只读） | `SceneOutline[]`（须与 Plan 一致） |
| C | 大纲微调 | 大纲助手 + **用户手改** | 最终 `SceneOutline[]`（可偏离 Plan，策略 A） |
| D | 课件生成 | 固定 Pipeline | `scenes` |
| E | 课堂讨论 | LangGraph Director（**另一编排域**） | 聊天消息 |

---

### 2.2 用户故事

| ID | 作为 | 我想要 | 以便 |
|----|------|--------|------|
| US-01 | 用户 | 只输入提示词（主题、时长、风格等） | 无资料也能生成完整课程 |
| US-01b | 用户 | 在填写课程需求后可选上传 PDF | ingest 后大纲与讨论可引用文档 |
| US-01c | 用户 | 同时提供提示词与 PDF | 目标由提示词定，内容 grounded 于文档（与 US-01b 组合路径一致，保留 ID 便于追溯） |
| US-02 | 用户 | 看到流式出现的大纲列表 | 在生成全文前了解课程结构 |
| US-03 | 用户 | 修改/确认大纲后生成 | 控制课程结构 |
| US-03a | 用户 | 在生成大纲前先看到并编辑课程蓝图 Plan | 控制页数、quiz 位置、知识点顺序（Phase 2） |
| US-03b | 用户 | 确认 Plan 后由 Agent 自动产出符合蓝图的大纲 | 减少单次 prompt 的不稳定（Phase 2） |
| US-03c | 用户 | 用对话方式微调已生成的大纲 | 不必逐项手改（M2+ 大纲编辑助手） |
| US-04 | 用户 | 首屏生成完即进入课堂 | 不必等待全部场景 |
| US-05 | 用户 | 观看幻灯片与讲稿字幕 | 理解内容 |
| US-06 | 用户 | 在课堂中向 Agent 提问 | 获得与当前课程相关的回答 |
| US-07 | 用户 | 有 PDF 时看到回答引用的文档片段 | 验证可信度 |
| US-07b | 用户 | 无 PDF 时仍能讨论当前页内容 | 不强制文档引用 |
| US-08 | 用户 | 完成 quiz 场景答题 | 检验学习效果 |

---

## 3. 功能范围

### 3.1 MVP 必做

| 模块 | 说明 | 借鉴 OpenMAIC | MVP 实现要点 |
|------|------|---------------|--------------|
| 提示词输入（必填） | 课程需求自由文本 | `UserRequirements.requirement` | 创建时 ≥10 字符；写入 `stage.requirement` |
| PDF 上传（可选） | 有文件时提取文本 + 页码 | `parse-pdf` | 可选附件；确认生成后 ingest；仅 **unpdf** |
| 知识库 ingest（可选） | 有 PDF 时分块、embedding | 无（新增） | `lib/knowledge/`；`has_knowledge_base` 标记 |
| RAG 检索（条件） | 有 chunks 时讨论/大纲增强 | 无（新增） | 无知识库时 retrieve 返回空，不报错 |
| 大纲生成 | 流式输出 `SceneOutline[]` | `scene-outlines-stream` | 保留 SSE；Planner 拆分为 Phase 2 |
| 场景生成 | 内容 + 讲稿 actions | `scene-content` + `scene-actions` | 仅 **slide**、**quiz** 两种 type |
| 课堂壳 | 场景列表 + 播放 + 聊天 | `classroom` + `Stage` | **单播放模式**，无 Pro 编辑 |
| 多 Agent 讨论 | Director 路由 + SSE | `director-graph` + `/api/chat` | **固定 3 Agent**，无 `agent-profiles` |
| 状态持久化 | 课程/场景/聊天/RAG | `stage` store | **Postgres 为主**；IndexedDB 仅可选 UI 缓存 |
| 设置 | 模型密钥 | `SettingsDialog` | 顶栏弹窗 → `localStorage` → 按 Route 附 Chat 或 Embedding 头子集；**无独立路由**（见 [LLM-IMPLEMENTATION.md](./LLM-IMPLEMENTATION.md) v2.3） |

#### 3.1.1 生成流水线策略（MVP 固定流程 → Phase 2 可切换）

**MVP 采用写死的固定生成流水线**，不实现大纲侧多 Agent 自主规划；Phase 2 通过功能开关切换为 Agent 编排，**不推翻** scene 生成与课堂播放链路。

**MVP 固定顺序**（`features.outlineOrchestration === false`，默认）：

```
ingest?（有 PDF）
  → POST /api/generate/scene-outlines-stream（单次 LLM + SSE）
  → PATCH /api/courses/[id]/outlines（用户可编辑大纲）
  → scene-content → scene-actions（首屏，再续生成）
  → /classroom/[id]
```

**演进约定**：

| 项 | MVP | Phase 2（见 [3.5 节](#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)） |
|----|-----|--------------------------------------------------------------|
| 大纲来源 | `lib/generation/outline-generator.ts` 单次调用 | 阶段 A：`Planner` 出 Plan → 用户冻结；阶段 B：`Drafter → Critic → Director` 循环 |
| 切换方式 | — | `features.outlineOrchestration: true` |
| API 入口 | 同一 `POST /api/generate/scene-outlines-stream` 内分支（MVP）；Phase 2 增加 Plan 与执行分步 API（见 §7） | 同上 |
| 下游不变 | `SceneOutline[]` 入库、`scene-content` / `scene-actions`、课堂只读播放 | 共用 |
| 大纲微调 | 手改 `OutlinesEditor` | 叠加 M2+ [大纲编辑助手](#312-大纲编辑助手m2非独立-agent-系统)（`features.outlineAssistant`） |

**实现要求（便于迁移）**：

- 业务逻辑放在 `lib/generation/`；Route 仅编排与 `features` 分支。
- 大纲输出始终为 `SceneOutline[]` + `languageDirective`，与 Phase 2 一致。
- Phase 2 **不推翻** `generation-preview` 主流程，增量增加 Plan 表格、评审 Round UI、大纲助手侧栏。
- **Plan 与 Outline 分层**：`sceneOutlines（蓝图）`（蓝图）与 `SceneOutline[]`（执行稿）分表/分字段存储（见 §6）。

#### 3.1.2 大纲编辑助手（M2+，非独立 Agent 系统）

> **定位**：在 **阶段 B 评审循环 `approve` 之后**（Phase 2），或 **MVP 单次 `scene-outlines-stream` 完成之后**，与「手改大纲」并列的可选能力。不纳入 M0～M4 必交范围；建议在 M2 完成后、Phase 2 之前或并行交付（**M2+**）。

##### 3.1.2.1 产品定位

在「大纲已写入 `stage.outlines` JSONB」与「用户点击确认大纲、开始 scene 生成」之间，增加 **可选聊天侧栏**，用 Vercel AI SDK **Tool Calling** 辅助修改大纲。

**不是**：

- OpenMAIC Pro 的 pi-agent-core / 持久化 Agent Runtime
- Phase 2 的 Planner / Critic / Director 自主编排（见 [3.5 节](#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)）
- 首次大纲生成（仍由 MVP `scene-outlines-stream` 或 Phase 2 阶段 B 负责）

**是**：

- 用户说「把第 2 页改成 quiz」→ 调用 `revise_outline` 等 tool → PATCH `stage.outlines` → 右侧 `OutlinesEditor` 刷新
- 轻量 API + 少量 tool，**不引入**独立 Worker / 事件溯源系统

##### 3.1.2.2 与冻结 Plan 的关系（策略 A：软约束）

| 层级 | 对 Plan 的约束 |
|------|----------------|
| 阶段 B（Agent 评审循环） | **硬约束**：Outline 必须与冻结 Plan 的 `sceneOutlines` 一致 |
| 阶段 C（大纲编辑助手 + 手改） | **软约束（策略 A）**：允许修改后的 Outline **偏离**冻结 Plan；确认大纲前 UI **可选**提示「与 Plan 不一致」，**不阻断**用户确认 |

用户主权：Plan 冻结后 Agent 不可改 Plan；用户若通过助手将大纲改到与 Plan 不一致，视为用户主动选择。

##### 3.1.2.3 Tool 定义（MVP 子集）

实现于 `lib/generation/outline-tools.ts`：

| Tool | 说明 |
|------|------|
| `list_outlines` | 读取当前 stage 的 `outlines` JSONB 列表摘要 |
| `revise_outline` | 按 `order` 或 `id` 修改 title / description / keyPoints / type |
| `insert_outline` | 在指定 order 后插入一页 |
| `delete_outline` | 删除指定页并重排 order |

- 使用 `streamText({ tools, maxSteps: 3 })`；**不使用** pi-agent-core。
- Tool `execute` **仅 PATCH `stage.outlines` JSONB**（见 §6.3），不调用 `scene-content`。

##### 3.1.2.4 Session 与续跑

复用 `chat_sessions` + `chat_messages`（见 §6），不新建 `agent_events` 表：

- `chat_sessions.session_type = 'outline'`，`stage_id` 关联课堂
- 进入 `generation-preview` 时 `GET /api/stages/[id]/chat-sessions?sessionType=outline` 恢复历史消息
- `chat_messages.metadata jsonb` 可选存 `{ toolName, toolArgs, outlineId }`

##### 3.1.2.5 API 与 SSE

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stages/[id]/chat-sessions?sessionType=outline` | 获取或创建 `session_type=outline` 的 session 及历史 |
| POST | `/api/chat` | 用户消息 → SSE 流式回复 + Tool 执行 |

**SSE 事件**（`/api/chat`，`config.sessionType: 'outline'`）：

| type | 载荷 | 说明 |
|------|------|------|
| `text_delta` | `{ delta: string }` | 助手文本流 |
| `tool_start` | `{ toolName, args }` | Tool 开始 |
| `tool_end` | `{ toolName, result }` | Tool 结束 |
| `outlines_updated` | `{ outlineIds?: string[] }` | 前端重新拉取 outlines |
| `done` | `{}` | 本轮结束 |
| `error` | `{ error: string }` | 错误 |

##### 3.1.2.6 页面（generation-preview 布局）

```
┌─────────────────────────────────────────────────────────┐
│ 步骤条：ingest → [Plan?] → 大纲 → 确认 → 首屏            │
├────────────────────┬────────────────────────────────────┤
│ 大纲编辑助手（可选） │ OutlinesEditor                      │
│ - 消息列表          │ - SSE / DB 加载的大纲列表            │
│ - 输入框            │ - 手改字段                          │
│ - tool 进度         │                                     │
├────────────────────┴────────────────────────────────────┤
│ [确认大纲，开始生成首屏]                                   │
└─────────────────────────────────────────────────────────┘
```

##### 3.1.2.7 功能开关

```typescript
// lib/config/features.ts
outlineAssistant: false,  // MVP 默认关；M2+ 完成后置 true
```

与 `outlineOrchestration` **独立**：可先开助手、后开 Phase 2 编排。

##### 3.1.2.8 里程碑

| 阶段 | 交付 |
|------|------|
| **M2+** | `outline-tools.ts` + `POST /api/chat（config.sessionType: 'outline'）` API + preview 侧栏 UI + outline session 续跑 |

---

### 3.2 场景类型（MVP）

#### slide

- **内容**：标题、要点、文本块、可选 PDF 页图引用。
- **actions**：`speech`（讲稿文本）为主；`discussion`（触发讨论）可选。
- **播放**：字幕区展示当前 `speech`；按阅读节奏自动推进（无 TTS）。

#### quiz

- **内容**：单选/多选/简答（MVP 至少支持单选 + 简答）。
- **actions**：`speech`（出题说明）+ 答题 UI；可选 `discussion`（错题讲解）。
- **批改**：调用 LLM 简答批改 API（参考 OpenMAIC `quiz-grade` 思路，可简化）。

**大纲约束**（写入 prompt）：

- 每门课 slide 为主，quiz 占 **1～2 页**，插在知识点讲解之后。
- 不允许 `interactive`、`pbl`（MVP prompt 不输出）。

### 3.3 固定 Agent 设定（MVP）

| ID | 角色 | 职责 |
|----|------|------|
| `teacher` | 教师 | 讲解、总结、引导讨论 |
| `student-a` | 学生 A | 提问、补充视角 |
| `student-b` | 学生 B | 质疑、类比、巩固 |

- Persona 写死在 `config/agents.json`，注册表只读。
- Director 负责轮询路由；单 Agent 时快速结束（沿用 OpenMAIC fast-path 思路）。

### 3.4 明确不做（MVP / 第二期）

| 功能 | 阶段 | 备注 |
|------|------|------|
| Pro 编辑 / 幻灯片编辑器 | Phase 2+ | 不做 `EditChromeRoot` |
| TTS / ASR / 音频指示器 | Phase 2+ | 播放纯文本节奏 |
| AI 图/视频生成 | Phase 2+ | 不做 `lib/media/` |
| interactive / PBL 场景 | Phase 2+ | 仅 slide + quiz |
| Agent 自动生成 | Phase 2+ | 不做 `agent-profiles` |
| 联网搜索 | Phase 2+ | 不做 `web-search` |
| 课堂 zip 导入导出 / PPTX | Phase 2+ | |
| 复杂 Roundtable UI | MVP 用简化 UI | 字幕条 + 聊天气泡 |
| 多 Provider 设置面板 | MVP 用 env | 不做大型 settings 面板 |
| autonomous 模式 / 跨 tab 编辑锁 | 不做 | |
| Curriculum Planner 独立节点 | Phase 2 | MVP 单次大纲 LLM；详见 [3.5 节](#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp) |
| 冻结 Plan + 大纲评审闭环 | Phase 2 | Planner → 用户冻结 Plan → Drafter / Critic / Director（**无 replan**）；非 MVP |
| 大纲编辑助手（Tool Chat） | M2+ | 见 [3.1.2 节](#312-大纲编辑助手m2非独立-agent-系统)；非 MVP 必交 |
| OpenMAIC Pro Agent Runtime | 不做 | 不引入 pi-agent-core / 持久化 Workbench Session |
| Director `replan` 自动改 Plan | 不做 | Plan 冻结后 Agent **不可**修改 Plan |

### 3.5 Phase 2 拓展：冻结 Plan + 大纲评审闭环（非 MVP）

> **定位**：在 MVP（及可选 M2+ 大纲编辑助手）全部完成并稳定后实施。本节为 **产品与技术规格**，不纳入 M0～M4 交付范围。  
> **核心定稿**：用户确认 Plan 后 **Plan 绝对冻结**；Agent 循环 **仅** 产出符合 Plan 的 `SceneOutline[]`；**禁止** Agent 在循环中 `replan` 修改 Plan。

#### 3.5.1 目标与动机

| 问题（MVP） | Phase 2 目标 |
|-------------|--------------|
| 页数、quiz 比例、知识点顺序在一次 prompt 中推断，不稳定 | 先 **Planner 出 Plan**，用户 **手改并冻结**，再 **执行 + 评审** |
| 全自动改 Plan 与用户意图冲突 | **Human-in-the-loop 冻结**：Plan 确认后人与 Agent 均不可改 Plan（除非用户主动「重新规划」） |
| 大纲与结构蓝图不一致 | **Critic 硬校验** Outline 与冻结 Plan 的 `sceneOutlines` 对齐 |
| 生成与讨论两套 Agent 能力不对等 | **双编排域**：生成流水线（本节）+ 课堂讨论（M3，§3.3） |

**成功标准（Phase 2）**：

- 同一 `requirement` 跑 10 次，**冻结 Plan** 后产出的 Outline 与 `sceneOutlines` 在页数、order、type 上一致率 ≥ 95%
- `revisionCount` 上限内（默认 3）`approve` 的比例 ≥ 70%
- 超限失败时正确进入 `outline_generation_failed` 并报错展示 Critic 报告

#### 3.5.2 三阶段生成域（与 §2.1.1 对齐）

```text
阶段 A — Plan 规划（人可改）
  ingest? → Planner → sceneOutlines（蓝图） → 用户编辑 Plan 表格
  → 【确认 Plan】→ `outline_confirmed_at` 已写入且蓝图只读

阶段 B — 大纲评审循环（Plan 只读，Agent 自主）
  Drafter(frozenSceneOutlines) → SceneOutline[]
  → Critic（是否符合 Plan？）
  → Director：redraft | approve（仅此二途 + 超限失败）
  → approve → 写入 stage.outlines JSONB

阶段 C — 大纲微调（人主导，策略 A）
  大纲编辑助手（可选，§3.1.2）+ OutlinesEditor 手改
  → 【确认大纲】→ scene 生成 → classroom
```

**Plan 冻结规则（硬约束）**：

1. 用户点击「确认 Plan」后：`outline_confirmed_at 写入`，`outline_confirmed_at` 写入，`generation_session_id` 递增。
2. 冻结后 **用户不可再编辑 Plan 表格**（UI 只读），除非点击 **「重新规划」**。
3. 阶段 B 循环中 **Agent 不得修改 Plan**；**禁用** `replan`、`ask_user`（改 Plan）路径。
4. 「重新规划」：`previewPhase = 'outline-ready'` → 归档或清空当前 `outlines` → 回到阶段 A（新 `generation_session_id`）。

#### 3.5.3 Agent 角色

| Agent ID | 角色 | 职责 |
|----------|------|------|
| `planner` | 课程规划师 | **仅阶段 A**：输出 `sceneOutlines` 蓝图 + `languageDirective` |
| `drafter` | 大纲撰写员 | **阶段 B**：严格按 **冻结 Plan** 生成 / 修订 `SceneOutline[]`；收到 Critic issues 时 **只改 outline** |
| `critic` | 结构评审 | **阶段 B**：校验执行稿与冻结 `sceneOutlines` 一致性 + 文案质量 |
| `director` | 流水线总监 | **阶段 B**：仅输出 `redraft` \| `approve`；**不得**输出 `replan` |

Persona 与 prompt 独立于课堂 `teacher` / `student-a` / `student-b`（两套编排域）。

#### 3.5.4 编排拓扑（冻结 Plan 后的 Execute → Review 循环）

```mermaid
flowchart TB
  subgraph stageA [阶段A_Plan用户可改]
    START --> Planner
    Planner --> PlanTable[用户编辑Plan表格]
    PlanTable --> Freeze[确认Plan冻结]
  end

  subgraph stageB [阶段B_Plan只读Agent循环]
    Freeze --> Drafter
    Drafter --> Critic
    Critic --> Director
    Director -->|redraft| Drafter
    Director -->|approve| OutlinesDone[outlines入库]
    Director -->|revisionCount超限| Fail[outline_generation_failed]
  end

  subgraph stageC [阶段C_人主导微调]
    OutlinesDone --> Assistant[大纲编辑助手可选]
    Assistant --> Manual[手改确认大纲]
    Manual --> Scenes[scene生成]
  end
```

**模式**：Plan-and-Execute（冻结 Plan）+ Critic 闭环；LangGraph `StateGraph` + 条件边；**无** `Planner` 再入环边。

#### 3.5.5 参考循环（示例）

**前提**：用户已确认 Plan——12 页，quiz 在 order 4、10；`outline_confirmed_at` 已写入且蓝图只读。

**Round 1**

- Drafter → 生成 12 条 `SceneOutline`
- Critic → `pass = false`：「第 7 页 keyPoints 未覆盖 Plan 槽位 7 的 teachingObjective；第 4 页 type 应为 quiz 实为 slide」
- Director → `next = redraft`

**Round 2**

- Drafter → 注入 Critic issues，修订 outline
- Critic → `pass = false`：「第 7 页与第 3 页知识点表述重复」
- Director → `next = redraft`

**Round 3**

- Drafter → 修订 outline
- Critic → `pass = true`
- Director → `next = approve` → END，写入 `outlines`

**若 Round 3 仍 `pass = false`**（`revisionCount >= revisionCountMax`，默认 3）：

- 不再继续循环
- `courses.status = 'outline_generation_failed'`
- SSE 发送 `error`：`{ error, criticReport, revisionCount }`
- UI 展示失败态 + 最后一版 Critic 报告
- 用户可选：**重新规划**（解冻 Plan）/ 用大纲助手或手改当前 outline 后强制确认（需产品确认二次确认弹窗）

> **注意**：示例中 **不会出现** `replan` 将 quiz 从 order 10 调到 9——该调整应在 **阶段 A 用户编辑 Plan** 时完成，而非 Agent 循环中。

#### 3.5.6 Critic 一致性校验项（硬编码进 prompt + 可选规则预检）

Critic **必须**检查 Outline 与冻结 `sceneOutlines（蓝图）.sceneOutlines` 的对齐：

| 检查项 | 说明 |
|--------|------|
| 页数 | `outlines.length === sceneOutlines.length` |
| order | 每页 `order` 与 Plan 槽位一致 |
| type | 每页 `type`（slide \| quiz）与 Plan 一致 |
| 教学目标 | 每页 `teachingObjective` / `keyPoints` **覆盖** Plan 槽位要求 |
| quiz 约束 | 蓝图中带 `type: 'quiz'` 的 `order` 与执行稿一致 |

**实现建议**：

- **规则预检**（代码）：页数、order、type、quiz 位置——不通过则 Critic 直接 `pass = false` 并附 `code`（如 `TYPE_MISMATCH`）
- **LLM 复检**（`generateObject`）：语义重复、难度、要点覆盖度

**Critic 不得**因「quiz 应放到其他 order」类 **Plan 结构问题** 建议 `replan`；此类 issue 应标注为「需用户重新规划」，仅展示文案，**不触发** Agent 改 Plan。

#### 3.5.7 核心数据结构

**对齐 OpenMAIC**（`lib/types/generation.ts`、`app/generation-preview/types.ts`）：

```typescript
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';

// 生成会话（客户端 sessionStorage；MindFlow 持久化映射 courses 表）
interface GenerationSessionState {
  sessionId: string;
  requirements: UserRequirements;
  pdfText?: string;
  sceneOutlines?: SceneOutline[] | null;
  previewPhase?: 'preparing' | 'outline-ready' | 'review' | 'generating-content';
  languageDirective?: string;
}
```

**Phase 2 蓝图**（Planner 输出，存 `courses.scene_outlines`；**仅** `previewPhase = 'outline-ready'` 且 `outline_confirmed_at` 为空时可 PATCH）：

- 类型仍为 `SceneOutline[]`，与 MVP 大纲一致（`order`、`type`、`title`、`description`、`keyPoints`、`teachingObjective` 等）
- 冻结标志：`outline_confirmed_at` 非空后蓝图只读（Agent 与用户均不可改，除非 `POST /api/courses/[id]/replan`）

**阶段 B SSE 载荷**（非独立 TypeScript 类型名，直接在事件中定义）：

```typescript
// critic 事件 data
{ pass: boolean; issues: Array<{ code: string; severity: string; message: string; affectedOrders?: number[] }>; summary: string }

// director 事件 data（仅二途）
{ next: 'redraft' | 'approve'; reason: string; focusOrders?: number[] }
```

**图状态**（Phase 2 在 `POST /api/generate/scene-outlines-stream` `phase: 'execute'` 单次请求内多轮）：

- `frozenSceneOutlines`（只读快照）、`sceneOutlines`、`criticReport`、`directorDecision`
- `revisionCount`（当前轮次）、`revisionCountMax`（默认 **3**，`features.revisionCountMax`）
- `requirements: UserRequirements`、`ragChunks`（有 PDF 时 Planner 阶段可 retrieve）


#### 3.5.8 与 MVP / M2+ 的差异

| 维度 | MVP（M2） | M2+（§3.1.2） | Phase 2（本节） |
|------|-----------|---------------|-----------------|
| Plan | 无 | 无 | Planner + 用户编辑 + **冻结** |
| 大纲生成 | 单次 LLM + SSE | 同 MVP | Drafter 按冻结 Plan + Critic/Director 循环 |
| 大纲微调 | 手改 | + 大纲编辑助手（策略 A） | 同 M2+ |
| Plan 能否被 Agent 改 | — | — | **否**（无 replan） |
| 循环失败 | jsonrepair 重试 | — | `revisionCount` 超限 → **报错退出** |
| 编排技术 | 无图 | AI SDK tools | `outline-generator.ts` + `scene-outlines-stream/route.ts` |

#### 3.5.9 API 与 SSE（Phase 2 扩展）

**阶段 A（蓝图规划）**——均复用 OpenMAIC 路由名，通过 body 分支：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/generate/scene-outlines-stream` | body `{ outlineOrchestration: true, phase: 'plan' }` → Planner 变体写入 `stage.scene_outlines` |
| GET | `/api/stages/[id]` | 读取 `sceneOutlines`、`previewPhase`、`outlines`、`outlineConfirmedAt` |
| PATCH | `/api/stages/[id]` | **仅蓝图未冻结**时用户编辑 `sceneOutlines`（`stage.scene_outlines`） |
| PATCH | `/api/stages/[id]` | 冻结蓝图：写入 `outlineConfirmedAt`，`generationSessionId++` |
| POST | `/api/stages/[id]/replan` | 解冻并回到阶段 A：清空 `outlineConfirmedAt`，`previewPhase: 'outline-ready'` |

**阶段 B（评审循环）**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/generate/scene-outlines-stream` | body `{ outlineOrchestration: true, phase: 'execute' }` → Drafter→Critic→Director（SSE） |

MVP 路径 `POST /api/generate/scene-outlines-stream`（`outlineOrchestration=false`）保持不变。

**阶段 B SSE 事件**（`/api/generate/scene-outlines-stream`，`phase: 'execute'`）：

| type | 载荷 | 说明 |
|------|------|------|
| `phase` | `{ phase: 'drafting' \| 'critiquing' \| 'directing', round: number }` | 步骤与轮次 |
| `outline` | `{ data: SceneOutline, index: number }` | Drafter 流式条目 |
| `critic` | `{ data: critic SSE 载荷, round: number }` | 每轮评审 |
| `director` | `{ data: director SSE 载荷, round: number }` | 路由决策 |
| `done` | `{ outlines, languageDirective, revisionRounds }` | approve 成功 |
| `error` | `{ error, criticReport?, revisionCount, code?: 'REVISION_LIMIT_EXCEEDED' }` | 含超限失败 |


#### 3.5.10 页面（generation-preview 扩展）

| 模式 | 步骤 |
|------|------|
| MVP | `ingest?` → `大纲 SSE` → `确认大纲` → `首屏` |
| M2+ | MVP 大纲完成后 → **大纲编辑助手侧栏（可选）** → `确认大纲` → `首屏` |
| Phase 2 | `ingest?` → **`生成 Plan`** → **`编辑 Plan`** → **`确认 Plan（冻结）`** → **`生成与评审大纲（Round UI）`** → **大纲助手（可选）** → `确认大纲` → `首屏` |

**Phase 2 UI 要点**：

- Plan 表格：`sceneOutlines` 可增删改（**仅 draft**）；冻结后只读 + 「重新规划」按钮
- Round 卡片：展示每轮 Critic 摘要、Director 决策（`redraft` / `approve`）
- 失败态：`outline_generation_failed` 时展示 Critic 最后一版报告 + 「重新规划」

#### 3.5.11 技术栈与目录

| 项 | 选型 |
|----|------|
| 编排 | LangGraph `StateGraph`（阶段 B） |
| LLM | Vercel AI SDK（`generateObject` / `streamText`） |
| 模块 | `lib/generation/outline-generator.ts`（`generateSceneOutlinesFromRequirements`、Critic/Director 节点）；`app/api/generate/scene-outlines-stream/route.ts`（`phase: 'plan' \| 'execute'` 分支） |
| 大纲助手 | `outline-tools.ts`（§3.1.2，AI SDK tools，与 LangGraph **分离**） |
| Prompt | `requirements-to-outlines/`、`scene-outlines-stream/`、`outline-critic/`、`outline-director/` |
| 开关 | `outlineOrchestration: false`（默认）；`outlineAssistant: false`（默认） |

**刻意不做**（与 OpenMAIC Pro 区分）：

- pi-agent-core、Postgres Agent Event Log、独立 Worker Runner
- Director `replan`、循环中 `ask_user` 改 Plan
- 20+ 课程构建 Tool

#### 3.5.12 里程碑与依赖

| 阶段 | 依赖 | 交付 |
|------|------|------|
| **M2+** | M2 完成 | 大纲编辑助手（§3.1.2） |
| **P2a** | M4 完成 | Planner + `OutlinesEditor` 编辑 `sceneOutlines` 蓝图 + 冻结 / `replan` API |
| **P2b** | P2a | Drafter + Critic + Director 循环 API（无 replan）+ SSE Round UI |
| **P2c** | P2b | `revisionCount` 超限失败态 + Critic 规则预检 |
| **P2d** | P2c | `eval/outline-orchestration`（10 主题通过率） |

**预估周期**：P2a～P2d 合计约 **1.5～2 周**（在 MVP 稳定后）；M2+ 约 **3～4 天**。

#### 3.5.13 风险与缓解

| 风险 | 缓解 |
|------|------|
| 多轮 LLM 成本与延迟 | `revisionCountMax` 默认 3；SSE 展示 round 进度 |
| Plan 冻结后结构不合理 | 阶段 A 充分编辑；Critic `requiresReplan` 提示 + 「重新规划」入口 |
| Director 输出非法 `next` | Zod 仅允许 `redraft` \| `approve`；非法则回退 `redraft` |
| 大纲助手改到与 Plan 不一致 | 策略 A：确认前可选警告，不阻断 |
| 与 MVP 代码分叉 | `features.outlineOrchestration` / `outlineAssistant` 双开关 |

---

## 4. 信息架构与页面

### 4.1 站点地图

与 OpenMAIC 一致，**仅三条页面路由**；设置不单独占路由。

```
/                       首页：需求输入 + PDF 上传 + 历史课程列表
/generation-preview     生成预览页：ingest / Plan? / 大纲 / 大纲助手? / 确认 / 首屏
/classroom/[id]         课堂页：侧栏场景 + 主舞台 + 字幕 + 讨论面板
```

**全局组件（非路由）**

```
SettingsDialog          顶栏设置按钮打开的弹窗（API Key、模型、embedding）
```

### 4.2 页面规格

#### 首页 `/`（`app/page.tsx`）

- 输入：**课程提示词（必填，多行）**——主题、受众、时长、风格等（≥10 字符）。
- 输入：**PDF 文件（可选，≤50MB）**——作为可选知识库素材。
- 校验：**必须先填写课程需求**；UI 文案：「请先描述课程需求，可再上传 PDF 作为参考资料」。
- 操作：`POST /api/stages` 创建课堂 → 将 `stageId`、`requirement`、PDF 元数据写入 `sessionStorage.generationSession`（与 OpenMAIC 模式一致）→ `router.push('/generation-preview')`。
- 列表：最近课堂（标题、是否有知识库图标、状态、创建时间）；点击条目 → `router.push('/classroom/[id]')`。
- **顶栏**：`SettingsDialog` 触发按钮（齿轮图标）。

#### 生成预览页 `/generation-preview`（`app/generation-preview/page.tsx`）

- 从 `sessionStorage.generationSession` 读取 `stageId` 与输入；缺失时重定向 `/`。
- **布局**：左侧可选「大纲编辑助手」聊天侧栏（`features.outlineAssistant`）+ 右侧 `OutlinesEditor`（见 §3.1.2.6）；Phase 2 增加 Plan 表格步骤（见 §3.5.10）。

**步骤指示（按功能开关动态组合）**：

| 模式 | 步骤 |
|------|------|
| **MVP**（默认） | `ingest?` → `生成大纲（scene-outlines-stream）` → `确认大纲` → `生成首屏` |
| **M2+** | MVP 大纲完成后 → `大纲编辑助手（可选）` → `确认大纲` → `生成首屏` |
| **Phase 2** | `ingest?` → `生成 Plan` → `编辑 Plan` → `确认 Plan（冻结）` → `生成与评审大纲（Round UI）` → `大纲助手（可选）` → `确认大纲` → `生成首屏` |

**MVP / M2+ 子路径**：

- **无附加 PDF**：`生成大纲` → …
- **有 PDF**：`解析入库` → `生成大纲（requirement + RAG/PDF 摘要）` → …

**Phase 2 子路径（`outlineOrchestration=true`）**：

- ingest 后 `POST /api/generate/scene-outlines-stream（body: `{ outlineOrchestration: true, phase: 'plan' }`）` → 用户编辑 `sceneOutlines` 表格（``previewPhase: 'outline-ready'``）
- 「确认 Plan」→ `POST .../outlines/confirm（设置 outlineConfirmedAt）` 冻结 → `POST /api/generate/scene-outlines-stream（body: `{ outlineOrchestration: true, phase: 'execute' }`）`（SSE 展示 Round）
- `approve` 或失败后进入大纲区；失败态见 §3.5.5

**大纲区行为**：

- SSE 流式卡片列表或从 DB 加载；`OutlinesEditor` 可手改 title/description/keyPoints
- `features.outlineAssistant` 开启时：侧栏 `POST /api/chat（config.sessionType: 'outline'）`，`outlines_updated` 事件刷新列表
- 确认大纲：`POST /api/stages/[id]/outlines/confirm`（`outlines_status = confirmed`，触发 scene 生成，见 §6.1.4）；手改期间用 `PATCH /api/stages/[id]/outlines`
- 首屏 scene 生成完成后：`router.push('/classroom/[id]')`
- **顶栏**：返回首页、「重新规划」（Phase 2 且已冻结时）、`SettingsDialog`

#### 课堂页 `/classroom/[id]`（`app/classroom/[id]/page.tsx`）

- 按 URL `id` 从 Postgres 加载 `stage` 与 `scenes`；无数据时展示错误态。
- **左栏**：场景列表（含生成中骨架、失败重试）。
- **中栏**：slide/quiz 渲染器（只读）。
- **底栏/侧栏**：讲稿字幕（当前 speech 文本）。
- **右栏**：讨论区（消息列表 + 输入框 + **引用来源**折叠块）。
- **顶栏**：播放/暂停、上一场景/下一场景（讨论进行中可禁用切换）、`SettingsDialog` 按钮。
- 后台：调用 ``useSceneGenerator().generateRemaining`（`lib/hooks/use-scene-generator.ts`）` 续生成剩余场景（与 OpenMAIC 课堂内续生成一致）。

#### 设置 `SettingsDialog`（`components/settings/`，非路由）

- 由首页 / 生成预览页 / 课堂页顶栏按钮打开，**不注册 `/settings` 路由**。
- 字段（MVP 精简版）：LLM API Key、Base URL、Model Name、Embedding 模型（或共用 OpenAI Key）。
- 持久化：`localStorage` 或 Zustand store（对齐 OpenMAIC `useSettingsStore`）；调用 AI API 时经 `X-Mindflow-Llm-*` 请求头传递（无服务端 LLM `.env` 兜底）。
- 无多厂商 Provider 切换 UI。

---

## 5. 技术架构

> 描述 MVP 及拓展阶段（M2+ 大纲编辑助手、Phase 2 冻结 Plan 编排）的模块划分、目录建议与关键数据流。实施步骤见 [DEV_GUIDE.md](./DEV_GUIDE.md)。实现时可参考 OpenMAIC **经典路径**对应模块，**不**引入 OpenMAIC Pro Agent Runtime。

### 5.1 设计原则

1. **薄壳 + 厚 lib**：页面与 API Route 只做编排，业务逻辑放在 `lib/`。
2. **插件化场景类型**：`slide` / `quiz` 通过 `lib/scenes/registry` 注册，便于扩展 `interactive`。
3. **条件 RAG**：`has_knowledge_base` 为唯一开关；无 PDF 时不走向量检索。
4. **无状态 Chat API**：课堂讨论每轮请求携带 `messages` + `directorState` + `stageId`；**不**为课堂引入服务端 Agent Session。
5. **功能开关**：`lib/config/features.ts` 控制 `outlineOrchestration`、`outlineAssistant` 等，避免半成品入口暴露。
6. **统一 LLM 入口（双链路）**：文本生成经 `lib/ai/llm.ts` 的 `callLLM` / `streamLLM`，Route 入口 **`requireChatModel(request)`**（[`lib/ai/openai-compat.ts`](../lib/ai/openai-compat.ts)）；向量经 **`requireEmbeddingModel(request)`**（[`lib/knowledge/embedding-config.ts`](../lib/knowledge/embedding-config.ts)）→ `embed.ts` / ingest / retrieve。**不**合并解析 chat 与 embedding。详见 [LLM-IMPLEMENTATION.md](./LLM-IMPLEMENTATION.md) v2.3。
7. **双编排域**：**生成域**（Plan / Outline / scene 生成）与 **课堂讨论域**（Director + 3 Agent）分离，各自 LangGraph 或流水线，不共用图状态。
8. **蓝图与执行稿分层**：`stage.scene_outlines`（Plan 蓝图，可冻结）与 `stage.outlines`（执行稿 JSONB）分字段存储；Phase 2 冻结后 Agent **不可**改 Plan。
9. **有界 Agent 循环**：Phase 2 评审循环 `revisionCountMax` 默认 3，超限 **报错退出**，不 silent retry。

### 5.2 技术栈

| 层 | 选型 |
|----|------|
| 框架 | Next.js 15 App Router, TypeScript |
| UI | Tailwind + shadcn/ui |
| LLM | Vercel AI SDK + `lib/ai/*` 统一封装 |
| Agent 编排 | LangGraph（课堂 Director + agent_generate；Phase 2 大纲评审图） |
| ORM | **Prisma**（仓库实现；schema 与 [§6](#6-数据模型) / [DATA-MODEL.md](./DATA-MODEL.md) 对齐） |
| 数据库 | **PostgreSQL + pgvector** |
| 文件 | PDF 存对象存储或本地 `uploads/`（MVP） |
| 部署 | Docker Compose（app + postgres）或 Vercel + Neon |

### 5.3 逻辑分层

```mermaid
flowchart TB
  subgraph presentation [Presentation]
    Pages[app_pages]
    Components[components]
  end

  subgraph application [Application_API]
    Routes[app_api_routes]
  end

  subgraph domain [Domain_lib]
    AI[lib_ai]
    Knowledge[lib_knowledge]
    Generation[lib_generation]
    Orchestration[lib_orchestration]
    Playback[lib_playback]
    Scenes[lib_scenes_registry]
  end

  subgraph infrastructure [Infrastructure]
    DB[prisma_postgres]
    LLM[ai_sdk]
    Graph[langgraph]
  end

  Pages --> Routes
  Routes --> domain
  domain --> infrastructure
```

| 层 | 职责 |
|----|------|
| Presentation | 页面、PlaybackShell、DiscussionPanel、只读 Slide/Quiz 渲染 |
| Application | HTTP/SSE 入口、鉴权、请求校验、DTO 转换 |
| Domain | 生成流水线、RAG、Agent 图、播放状态机 |
| Infrastructure | Postgres、pgvector、LLM 调用 |

### 5.4 系统架构图

```mermaid
flowchart TB
  subgraph client [Browser]
    Pages[Nextjs_Pages]
    Player[PlaybackShell]
    ChatPanel[DiscussionPanel]
  end

  subgraph api [Nextjs_API_Routes]
    ParseAPI[parse_pdf]
    IngestAPI[knowledge_ingest]
    OutlineAPI[outlines_stream]
    ContentAPI[scene_content]
    ActionsAPI[scene_actions]
    ChatAPI[chat]
    GradeAPI[quiz_grade]
  end

  subgraph core [Core_Libs]
    Knowledge[lib_knowledge]
    Generation[lib_generation]
    Orchestration[lib_orchestration]
    Playback[lib_playback]
  end

  subgraph data [Postgres_pgvector]
    StageTbl[(stage)]
    ChunksTbl[(chunks)]
    ScenesTbl[(scenes)]
    ChatMsgs[(chat_messages)]
  end

  Pages --> api
  Player --> Playback
  ChatPanel --> ChatAPI
  ParseAPI --> Knowledge
  IngestAPI --> Knowledge
  OutlineAPI --> Generation
  Knowledge --> ChunksTbl
  Generation --> StageTbl
  ChatAPI --> Orchestration
  Orchestration --> Knowledge
  api --> data
```

### 5.5 推荐目录结构

```
mindflow/
├── app/
│   ├── page.tsx
│   ├── generation-preview/page.tsx
│   ├── classroom/[id]/page.tsx
│   └── api/
│       ├── stages/route.ts
│       ├── stages/[id]/route.ts              # GET/PATCH sceneOutlines + previewPhase
│       ├── stages/[id]/ingest/route.ts
│       ├── stages/[id]/replan/route.ts       # Phase 2
│       ├── stages/[id]/outlines/route.ts
│       ├── stages/[id]/outlines/confirm/route.ts
│       ├── stages/[id]/chat-sessions/route.ts
│       ├── parse-pdf/route.ts
│       ├── generate/
│       │   ├── scene-outlines-stream/route.ts
│       │   ├── scene-content/route.ts
│       │   └── scene-actions/route.ts
│       ├── chat/route.ts
│       └── quiz-grade/route.ts
├── components/
│   ├── settings/
│   ├── playback/PlaybackShell.tsx
│   ├── discussion/DiscussionPanel.tsx
│   ├── generation/
│   │   ├── OutlinesEditor.tsx
│   │   ├── OutlineReviewRounds.tsx
│   │   └── OutlineAssistantPanel.tsx
│   └── scenes/
├── config/agents.json
├── lib/
│   ├── ai/                                   # callLLM / streamLLM
│   ├── config/features.ts
│   ├── db/
│   ├── knowledge/
│   ├── generation/
│   ├── orchestration/
│   ├── chat/agent-loop.ts
│   ├── hooks/use-scene-generator.ts
│   ├── playback/
│   └── scenes/
├── uploads/
└── docker-compose.yml
```

### 5.6 核心模块

#### `lib/knowledge`

| 文件 | 职责 |
|------|------|
| `chunk.ts` | 按 token/字符切分，保留 `page` 元数据 |
| `embedding-config.ts` | 读 RAG 请求头 → **`requireEmbeddingModel`**（向量链路入口，与 `lib/ai` 分离） |
| `embed.ts` | 注入 `EmbeddingModel`，`embedMany` 写入 `chunks.embedding`（1024 维） |
| `ingest.ts` / `knowledge` 服务 | parse 后 orchestrate：chunk → embed → DB |
| `retrieve.ts` | `stageId` + `query` + 同源 `embeddingModel` → topK `SourceRef[]` |

#### `lib/generation`

**生成域三轨**（[§3.1.1](#311-生成流水线策略mvp-固定流程--phase-2-可切换)、[§3.5](#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)）：

- **MVP**：`outline-generator.ts` + `POST /api/generate/scene-outlines-stream`（单次 LLM + SSE）。
- **M2+**：`outline-tools.ts` + `POST /api/chat`（`sessionType: 'outline'`），Session 存 `chat_sessions.session_type='outline'`。
- **Phase 2**：同一 SSE 路由按 `phase: 'plan' | 'execute'` 分支；评审循环 Drafter → Critic → Director（**无 replan**）。

两阶段 scene 生成（与 OpenMAIC 经典路径一致）：`SceneOutline` → `scene-content` → `scene-actions` → `Scene`。首屏仅 `sort_order=1`，其余由 `generateRemaining` 串行完成。

| 输入模式 | 大纲 prompt 输入 |
|----------|------------------|
| 无附加 PDF | `requirement`（创建时必填） |
| 有 PDF（已 ingest） | `requirement` + retrieve topK 或文档摘要 |

#### `lib/orchestration`

课堂讨论（MVP）：`START → director → agent_generate → END`。请求体携带 `messages`、`storeState`、`retrievedChunks`、`requirement`；客户端 `agent-loop.ts` 多轮调用 `/api/chat` 直至 `cue_user` 或 `done`。

#### `lib/playback`

`TimelinePlayer` 消费 `Scene.actions[]`，回调 `onSpeech` / `onDiscussion` / `onComplete`；无 TTS 时用 `pacing.estimateReadDuration`。`PlaybackShell` 驱动字幕 UI。

#### `lib/scenes/registry`

按 `type` 注册 `generateContent`、`generateActions`、`Renderer`；MVP 仅 `slide`、`quiz`。

### 5.7 核心数据流

**生成链路（MVP）**

1. 首页 `POST /api/stages`：body `{ requirement, pdf? }`，**requirement 必填**；有 pdf 则存 `documents`；返回 `stageId`。
2. 首页写入 `sessionStorage.generationSession` → 导航 `/generation-preview`。
3. 生成预览页 **若有 PDF**：`POST /api/stages/[id]/ingest` → parse → chunk → embed → `has_knowledge_base=true`。
4. `POST /api/generate/scene-outlines-stream`（`outlineOrchestration=false`）：
   - 无知识库：`requirement` → LLM 大纲；
   - 有知识库：`requirement` + RAG topK 或 pdf 摘要 → LLM 大纲；
   - 流式完成后写入 `stage.outlines` JSONB，`outlines_status = 'draft'`（§6.1.4；流式过程中仅 sessionStorage）。
5. **（M2+，可选）** `POST /api/chat`：大纲编辑助手 Tool PATCH `stage.outlines`（§3.1.2、§6.3）。
6. `POST /api/stages/[id]/outlines/confirm`：用户确认执行稿大纲，`outlines_status = 'confirmed'`。
7. 对每个 outline（首屏先 1 个）：`scene-content` → `scene-actions` → 写 `scenes`。
8. 首屏完成后导航 `/classroom/[id]`；课堂页续生成剩余 scenes；全部 `ready` 后 `outlines_status = 'scenes_ready'`（默认保留 `outlines`）。

**生成链路（Phase 2，`outlineOrchestration=true`）**

1. 步骤 1～3 同 MVP。
2. `POST /api/generate/scene-outlines-stream`（`outlineOrchestration: true, phase: 'plan'`）→ Planner 写入 `stage.scene_outlines`，`previewPhase: 'outline-ready'`。
3. 用户 `PATCH /api/stages/[id]` 编辑 `sceneOutlines` 蓝图。
4. 冻结蓝图：写入 `outlineConfirmedAt`（此后 Agent 不可改 `scene_outlines`）。
5. `POST /api/generate/scene-outlines-stream`（`phase: 'execute'`）（SSE）：Drafter → Critic → Director `redraft` \| `approve`；超限 → `outline_generation_failed` + SSE `error`（§3.5.5）。
6. `approve` 后覆盖写入 `stage.outlines` JSONB；后续同 MVP（含可选大纲助手）。

**讨论链路**（与生成域独立，**无状态**）

1. 用户消息 → `POST /api/chat`。
2. 若 `stage.has_knowledge_base`：`retrieve(stageId, query)` → topK chunks；否则 `sources=[]`。
3. LangGraph：director → agent_generate（chunks【可选】+ requirement + 当前 scene）。
4. SSE 返回 text；有 sources 时展示引用块。

### 5.8 数据流时序

**创建课堂（有 PDF）**

```mermaid
sequenceDiagram
  participant U as User
  participant API as API_stages
  participant Ing as ingest
  participant DB as Postgres

  U->>API: POST requirement + pdf
  API->>DB: insert stage, document
  API->>Ing: chunk + embed
  Ing->>DB: chunks.embedding
  Ing->>DB: has_knowledge_base=true
  API-->>U: stageId
```

**课堂讨论（RAG）**

```mermaid
sequenceDiagram
  participant U as User
  participant API as API_chat
  participant RAG as retrieve
  participant G as LangGraph
  participant LLM as LLM

  U->>API: message + stageId
  API->>RAG: retrieve(query)
  RAG-->>API: SourceRef[]
  API->>G: state + chunks
  G->>LLM: director / agent
  LLM-->>G: stream
  G-->>API: SSE events
  API-->>U: text + sources
```

**Phase 2：冻结 Plan → 评审大纲**

```mermaid
sequenceDiagram
  participant P as GenerationPreview
  participant API as API
  participant PL as Planner
  participant DB as Postgres
  participant G as outline_generator

  P->>API: POST scene-outlines-stream phase=plan
  API->>PL: generateObject
  PL->>DB: scene_outlines, previewPhase
  P->>API: PATCH stage freeze Plan
  P->>API: outlines confirm / outlineConfirmedAt

  P->>API: POST scene-outlines-stream phase=execute
  loop revisionCount le max
    API->>G: Drafter
    G->>G: Critic
    G->>G: Director
  end
  alt approve
    G->>DB: stage.outlines
    API-->>P: SSE done
  else limit exceeded
    API->>DB: outline_generation_failed
    API-->>P: SSE error REVISION_LIMIT_EXCEEDED
  end
```

**M2+：大纲编辑助手**

```mermaid
sequenceDiagram
  participant P as GenerationPreview
  participant API as POST_api_chat_outline
  participant DB as Postgres

  P->>API: GET chat-sessions sessionType=outline
  API-->>P: messages history
  P->>API: POST chat outline tools
  API->>DB: PATCH stage.outlines
  API-->>P: SSE outlines_updated
```

### 5.9 数据库与 pgvector

- 使用 Neon、Supabase 或 Docker 本地 Postgres，启用 `vector` 扩展。
- Schema 与 [§6.1](#61-表结构m0m4--m2--phase-2) 一致：**向量存 `chunks.embedding`**，不建 `chunk_embeddings` 表。
- 迁移：`prisma migrate`（或项目约定的版本化 migration）。

**相似度查询示例**（概念）：

```sql
SELECT id, content, page,
       1 - (embedding <=> $query_embedding::vector) AS score
FROM chunks
WHERE stage_id = $stage_id
ORDER BY embedding <=> $query_embedding::vector
LIMIT 8;
```

### 5.10 环境与配置

| 变量 / 来源 | 说明 |
|-------------|------|
| `DATABASE_URL` | Postgres 连接串（服务端 `.env`） |
| `UPLOAD_DIR` | 本地 PDF 目录，默认 `./uploads`（服务端 `.env`） |
| **`X-Mindflow-Llm-*` 请求头** | **分链路**：生成 API 带 Key + Base-Url + Chat-Model；ingest/retrieve 带 Key + Base-Url + Embedding-Model；**无**服务端 LLM `.env` 兜底（见 [LLM-IMPLEMENTATION.md](./LLM-IMPLEMENTATION.md) v2.3） |
| **`SettingsDialog`** | 四项写入 `localStorage`；`getMindflowChatHeaders()` / `getMindflowEmbeddingHeaders()` 按 Route 附带 |

创建课堂（`POST /api/stages`）**不**要求 LLM 头；嵌套 `requirements` 形状见 LLM 文档 §5。

### 5.11 与 OpenMAIC 的差异摘要

| 维度 | OpenMAIC 经典路径 | OpenMAIC 1.0 Pro | MindFlow |
|------|-------------------|------------------|----------|
| 页面路由 | `/`、`/generation-preview`、`/classroom/[id]` | + `/workspace` | **相同三条** |
| 生成大纲 | 单次 `scene-outlines-stream` | Agent tools | MVP 同左；Phase 2 冻结 Plan + 评审循环 |
| Plan 冻结 / Critic | 无 | 隐式 | **显式** `scene_outlines` + 有界 redraft |
| 大纲助手 | 无 | Pro 聊天 | M2+ `POST /api/chat`（`sessionType: outline`） |
| 课堂讨论 | 无状态 `/api/chat` | 同左 | 同左 |
| Agent Runtime | 无 | pi-agent + Postgres Session | **不做** |
| 持久化 | IndexedDB / 可选 PG | Postgres | Postgres + pgvector |
| RAG | 模块未完全接线 | 字面搜索 | pgvector retrieve |
| 场景类型 | 多种 | 多种 | slide + quiz |
| 播放 | TTS + Pro | 同左 | TimelinePlayer + 字幕 |

**参考**：OpenMAIC `lib/orchestration/director-graph.ts`、`app/api/generate/scene-outlines-stream/route.ts`；**不参考** `lib/server/agent-runtime/`。

### 5.12 部署建议（MVP）

**Docker Compose**（本地/demo）：`app`（Next.js）+ `db`（`pgvector/pgvector:pg16`）。

**生产**：Vercel（前端 + API）+ Neon（Postgres + pgvector）；PDF 大文件注意 serverless 超时，ingest 可拆后台 job（Phase 2）。

---

## 6. 数据模型

> **定稿说明（v1.6）**：共 **6 张表**；根实体表名为 `stage`（对齐 OpenMAIC `Stage`）；消息表名为 `chat_messages`；**不建** `outlines`、`agents`、`chunk_embeddings`、`generation_jobs` 表。执行稿大纲存 `stage.outlines` JSONB，Plan 蓝图存 `stage.scene_outlines` JSONB。完整规格见 [DATA-MODEL.md](./DATA-MODEL.md)。

### 6.1 表结构（M0～M4 + M2+ + Phase 2）

```sql
-- 课堂根实体（对齐 OpenMAIC Stage）
stage (
  id uuid PK,
  name text NOT NULL,                    -- 课程标题（LLM 或用户）
  description text,
  requirement text NOT NULL DEFAULT '',  -- 用户提示词；API 创建时必填（≥10 字符）
  language_directive text,
  has_knowledge_base boolean DEFAULT false,
  status text NOT NULL DEFAULT 'draft',  -- 见 §6.1.1
  preview_phase text DEFAULT 'preparing', -- preparing | outline-ready | review | generating-content
  outlines jsonb NOT NULL DEFAULT '[]',  -- 执行稿 SceneOutline[]（M2/M2+/P2b）
  outlines_status text DEFAULT 'draft',  -- draft | confirmed | scenes_ready | archived（见 §6.1.4）
  scene_outlines jsonb,                  -- Phase 2 Plan 蓝图 SceneOutline[]
  outline_confirmed_at timestamptz,      -- Plan 冻结时间（P2a）
  generation_session_id int DEFAULT 1,   -- 每次「重新规划」递增
  last_critic_report jsonb,              -- P2c 失败展示
  current_scene_id uuid REFERENCES scenes(id), -- M4 播放/续生成指针
  agent_ids jsonb,                       -- M3 讨论 Agent（默认 config/agents.json）
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
)

-- PDF 元数据
documents (
  id uuid PK,
  stage_id uuid NOT NULL REFERENCES stage(id) ON DELETE CASCADE,
  filename text NOT NULL,
  page_count int,
  raw_text text,                         -- ingest 产物；大文本可只存 chunks
  storage_path text,                     -- 可选对象存储路径
  created_at timestamptz NOT NULL
)

-- RAG 分块 + 向量（不单独建 chunk_embeddings）
chunks (
  id uuid PK,
  stage_id uuid NOT NULL REFERENCES stage(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  page int,
  chunk_index int NOT NULL,
  metadata jsonb,
  embedding vector(1536),                -- 维度随 embedding 模型调整
  created_at timestamptz NOT NULL
)

-- 已生成课堂页（对齐 OpenMAIC Scene）
scenes (
  id uuid PK,
  stage_id uuid NOT NULL REFERENCES stage(id) ON DELETE CASCADE,
  outline_id text NOT NULL,              -- 逻辑关联 stage.outlines[].id（非 FK）
  sort_order int NOT NULL,
  type text NOT NULL,                    -- slide | quiz
  title text NOT NULL,
  content jsonb NOT NULL,
  actions jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending', -- pending | generating | ready | failed
  error_message text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
)

-- 会话元数据（课堂讨论 + 大纲编辑助手）
chat_sessions (
  id uuid PK,
  stage_id uuid NOT NULL REFERENCES stage(id) ON DELETE CASCADE,
  scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  session_type text NOT NULL,            -- qa | discussion | lecture | outline（M2+）
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idle',   -- idle | active | completed | error
  config jsonb NOT NULL DEFAULT '{}',    -- agentIds, triggerAgentId, defaultAgentId
  last_action_index int,                 -- lecture 进度
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
)

-- 消息行
chat_messages (
  id uuid PK,
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,                    -- user | assistant | system
  content text NOT NULL,
  agent_id text,                         -- M3 多 Agent 气泡
  sources jsonb,                         -- RAG 引用 [{ chunkId, page, excerpt }]
  metadata jsonb,                        -- M2+：{ toolName, toolArgs, outlineId }
  created_at timestamptz NOT NULL
)
```

#### 6.1.1 `stage.status` 状态机

```
draft → ingesting → outline_generating → outline_ready
  → [P2: plan_frozen → outline_reviewing]
  → outline_confirmed → scene_generating → ready
  → outline_generation_failed   -- P2c revisionCount 超限
  → error
```

#### 6.1.2 双层大纲（不建 outlines 表）

| JSONB 列 | API 字段名 | 产品含义 | 读写规则 |
|----------|------------|----------|----------|
| `scene_outlines` | `sceneOutlines` | Phase 2 **Plan 蓝图** | 阶段 A 可编辑；确认后只读；「重新规划」清空并回到 `outline_ready` |
| `outlines` | `outlines` | **执行稿**（生成 scene 的工作副本） | SSE `done` 写入；M2+ Tool PATCH；P2b approve 覆盖；见 [§6.1.4](#614-大纲与-plan-生命周期) |

`SceneOutline` JSON 形状见 [§13.1](#131-sceneoutline-类型mvp-子集)；与 `lib/types/generation.ts` 对齐，MindFlow 仅允许 `type: "slide" | "quiz"`。

#### 6.1.3 不建表的能力归属

| 能力 | 存放位置 |
|------|----------|
| 固定 3 Agent 人设 | `config/agents.json` |
| API Key / 模型 / RAG 参数 | `SettingsDialog` → `localStorage` → LLM 请求头（ingest / 生成等 Route） |
| 生成草稿 / 未确认中间态 | `sessionStorage` |
| Quiz 作答进度 | `localStorage` |
| Phase 2 Round 中间态 | 请求内存 + SSE；终态写 `stage` |
| Feature 开关 | `lib/config/features.ts` |

#### 6.1.4 大纲与 Plan 生命周期

> **定位**：Plan 与执行稿 Outline 均为**生成域中间产物**；课堂播放只依赖 `scenes`。本节规定何时用临时存储、何时写 `stage` JSONB、何时可清理。

##### 三态存储模型

| 层级 | 名称 | 存放位置 | 内容 |
|------|------|----------|------|
| **L0** | 草稿 | `sessionStorage.generationSession` + 前端 state | SSE 流式中间结果、未确认手改 |
| **L1** | 工作副本 | `stage.scene_outlines` / `stage.outlines` JSONB | 可恢复、可 PATCH 的 Plan / 执行稿 |
| **L2** | 终态 | `scenes` 表 | `content` + `actions`，课堂播放依据 |

```mermaid
flowchart LR
  subgraph L0 [L0_草稿]
    SS[sessionStorage]
  end
  subgraph L1 [L1_工作副本]
    PO[scene_outlines]
    EO[outlines]
  end
  subgraph L2 [L2_终态]
    SC[scenes]
  end
  SS -->|Planner_done| PO
  SS -->|SSE_done| EO
  EO -->|确认大纲| SC
```

##### Plan（`stage.scene_outlines`，仅 Phase 2）

| 时机 | 存储 | 说明 |
|------|------|------|
| Planner 运行前 | **L0** `sessionStorage` | 不写 DB |
| Planner SSE `done` | **L1** `stage.scene_outlines` | `preview_phase = 'outline-ready'` |
| 用户编辑 Plan | **L1** PATCH `stage` / `sceneOutlines` | 仅 `outline_confirmed_at` 为空时 |
| 确认 Plan（冻结） | **L1** 保留 + `outline_confirmed_at` | UI 只读；**长期保留**（结构合同，不随 scene 清理） |
| 重新规划 | 清空或重置 `outlines`；`generation_session_id++`；`outline_confirmed_at = null` | 回到阶段 A |

**MVP / M2**：不使用 `scene_outlines`（列保持 `NULL`）。

##### 执行稿 Outline（`stage.outlines`）

| 时机 | 存储 | 说明 |
|------|------|------|
| SSE 流式过程中 | **L0** 仅 `sessionStorage` + 内存 | **禁止**逐条写 DB |
| SSE `done` | **L1** `stage.outlines` + `outlines_status = 'draft'` | 刷新可恢复；进入大纲编辑区 |
| 手改 / M2+ Tool | **L1** `PATCH /api/stages/[id]/outlines` | 原子 PATCH |
| 用户确认大纲 | **L1** `outlines_status = 'confirmed'` | 触发 scene 生成；**保留** `outlines` 供 `scenes.outline_id` 映射 |
| 续生成 / 单页重试（M4） | **L1** 继续保留 | `scenes.outline_id` → `outlines[].id` |
| 全部 scene `status = ready` | **L1** 默认**保留**；`outlines_status = 'scenes_ready'` | 播放不读 outlines |
| 可选归档 | `outlines_status = 'archived'` 或清空 `outlines = []` | 仅当不再需要单页重试；`scenes` 已冗余 title/type |

**`outlines_status` 状态机**：

```
draft → confirmed → scenes_ready → archived（可选）
```

##### MVP vs Phase 2 对照

| | MVP / M2 | Phase 2 |
|--|----------|---------|
| Plan | 无 | `scene_outlines`，冻结后长期保留 |
| 执行稿 | `outlines`，SSE `done` 落库 | 同左，须对齐冻结 Plan |
| 课堂播放 | 仅 `scenes` | 同左 |

##### 相关 API

| 操作 | 路径 | 效果 |
|------|------|------|
| SSE 大纲完成 | 内部或 `PATCH .../outlines` `op: replace` | 写 `stage.outlines`，`outlines_status = draft` |
| 确认大纲开生成 | `POST /api/stages/[id]/outlines/confirm` | `outlines_status = confirmed`，触发首屏 scene 生成 |
| Planner 完成 | `PATCH /api/stages/[id]` | 写 `scene_outlines` |
| 冻结 Plan | `PATCH /api/stages/[id]` | `outline_confirmed_at` |
| scene 全部 ready | 内部（续生成结束时） | `outlines_status = scenes_ready`（默认不清空 `outlines`） |

### 6.2 索引

- `documents(stage_id)`、`chunks(stage_id)`、`chunks(document_id)`。
- `chunks.embedding` 上 HNSW 或 IVFFlat（`vector_cosine_ops`）。
- `scenes(stage_id, sort_order)`、`chat_sessions(stage_id, session_type)`。
- `chat_messages(session_id, created_at)`。

### 6.3 执行稿大纲 PATCH（`stage.outlines` JSONB）

**路径**：`PATCH /api/stages/[id]/outlines`

**用途**：M2 手改确认、M2+ 大纲助手 Tool 写入、Phase 2 approve 后落库。所有对执行稿大纲的写操作均经此 API（或内部复用同一 `applyOutlinePatch` 函数），避免并发覆盖 JSONB。

**请求体**（`Content-Type: application/json`）：

```typescript
type OutlinePatchRequest =
  | { op: 'replace'; outlines: SceneOutline[]; expectedRevision?: number }
  | { op: 'revise'; id: string; patch: Partial<SceneOutline> }
  | { op: 'insert'; afterOrder?: number; outline: SceneOutline }
  | { op: 'delete'; id: string }
  | { op: 'reorder'; ids: string[] }; // 按 ids 顺序重排 order
```

**并发控制**：可选 `expectedRevision` 与 `stage.updated_at` 或专用 `outline_revision` 比对；不匹配返回 `409 CONFLICT`，客户端重新 `GET` 后重试。

**响应**：

```json
{ "success": true, "outlines": [ /* SceneOutline[] */ ], "updatedOutlineIds": ["scene_2"] }
```

**规则**：

1. `revise` / `delete` / `reorder` 后自动重算 `order` 为 1..N 连续整数。
2. `scenes.outline_id` 为 text 逻辑关联；`delete` 时若存在绑定 scene 返回 `400` 并列出 `orphanSceneIds`，或 body 传 `force: true` 同步标记 orphan scenes 为 `failed`。
3. M2+ Tool `execute` 内部调用同一 patch 逻辑；成功后 SSE 发 `outlines_updated`。

**GET**：`GET /api/stages/[id]` 返回 `outlines` 与 `sceneOutlines`（camelCase）及 `scenes` 摘要。

---

## 7. API 规格

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/stages` | 创建课堂：`requirement`（必填）与可选 `pdf?`（multipart） |
| GET | `/api/stages` | 课堂列表 |
| GET | `/api/stages/[id]` | 详情：`sceneOutlines`、`previewPhase`、`outlines`、`scenes` 状态 |
| PATCH | `/api/stages/[id]` | 更新 `sceneOutlines` / `previewPhase`；冻结蓝图时写 `outlineConfirmedAt` |
| POST | `/api/stages/[id]/replan` | Phase 2：解冻蓝图，回到阶段 A |
| POST | `/api/stages/[id]/ingest` | 有 PDF 时解析并入库 RAG；无文档返回 400 |
| POST | `/api/parse-pdf` | 对齐 OpenMAIC PDF 解析 |
| POST | `/api/generate/scene-outlines-stream` | SSE 流式大纲（MVP；Phase 2 通过 body `phase` 分支） |
| PATCH | `/api/stages/[id]/outlines` | 原子 PATCH `stage.outlines` JSONB（手改 / Tool / approve，见 §6.3） |
| POST | `/api/stages/[id]/outlines/confirm` | 确认执行稿大纲，`outlines_status = confirmed`，触发 scene 生成（§6.1.4） |
| POST | `/api/generate/scene-content` | 单页内容生成 |
| POST | `/api/generate/scene-actions` | 单页 actions + 组装 scene |
| POST | `/api/chat` | 课堂多 Agent SSE；M2+ 大纲助手（`config.sessionType: 'outline'`） |
| GET | `/api/stages/[id]/chat-sessions` | M2+：获取 `sessionType=outline` 的历史消息 |
| POST | `/api/quiz-grade` | 简答题批改 |
| GET | `/api/health` | 健康检查 |

> **实现说明**：`POST /api/chat` 为 **M2+/M3 交付项**；仓库已移除早期 M1 RAG 测试用 JSON 接口，联调与实施手册不再引用该 demo。
>
> **续生成**：无独立 API；课堂页调用 `useSceneGenerator().generateRemaining`（`lib/hooks/use-scene-generator.ts`），与 OpenMAIC 一致。

### 7.1 SSE 事件

**大纲流**（`/api/generate/scene-outlines-stream`）：

| type | 载荷 |
|------|------|
| `phase` | `{ phase: 'ingest' \| 'outline' }` |
| `languageDirective` | `{ data: string }` |
| `outline` | `{ data: SceneOutline, index: number }` |
| `done` | `{ outlines: SceneOutline[], languageDirective: string }` |
| `error` | `{ error: string }` |
| `retry` | `{ attempt, maxAttempts }` |

**大纲评审流**（`/api/generate/scene-outlines-stream`，Phase 2）：

| type | 载荷 |
|------|------|
| `phase` | `{ phase: 'drafting' \| 'critiquing' \| 'directing', round: number }` |
| `outline` | `{ data: SceneOutline, index: number }` |
| `critic` | `{ data: critic SSE 载荷, round: number }` |
| `director` | `{ data: director SSE 载荷, round: number }` |
| `done` | `{ outlines, languageDirective, revisionRounds }` |
| `error` | `{ error, criticReport?, revisionCount, code?: 'REVISION_LIMIT_EXCEEDED' }` |

**大纲编辑助手流**（`/api/chat`，M2+）：

| type | 载荷 |
|------|------|
| `text_delta` | `{ delta: string }` |
| `tool_start` | `{ toolName, args }` |
| `tool_end` | `{ toolName, result }` |
| `outlines_updated` | `{ outlineIds?: string[] }` |
| `done` | `{}` |
| `error` | `{ error: string }` |

**聊天流**（`/api/chat`）：

| type | 载荷 |
|------|------|
| `thinking` | `{ stage, agentId? }` |
| `agent_start` | `{ agentId, name }` |
| `text_delta` | `{ agentId, delta }` |
| `agent_end` | `{ agentId }` |
| `sources` | `{ chunks: SourceRef[] }` |
| `cue_user` | `{}` |
| `done` | `{ directorState? }` |
| `error` | `{ error: string }` |

### 7.2 创建课堂请求示例

**无附加 PDF**（JSON）：

```json
POST /api/stages
Content-Type: application/json

{
  "requirement": "用 20 分钟向初学者讲解 React Hooks，包含 useState 和 useEffect，最后有一道测验。"
}
```

**提示词 + PDF**（multipart）：

```
POST /api/stages
Content-Type: multipart/form-data

requirement: "重点讲第三章的算法复杂度，结合讲义中的例题"
pdf: <file>
```

---

## 8. RAG 规格

### 8.1 Ingest

- 触发：课堂创建后，若存在 PDF 则自动或手动调用 ingest。
- Chunk size：500～800 tokens，overlap 80 tokens。
- 元数据：`page`、`document_id`、`stage_id`。
- Embedding：ingest 等 RAG Route 经 `requireEmbeddingModel` 读 `X-Mindflow-Llm-Embedding-Model`（如 `BAAI/bge-m3`），**1024** 维，与 `chunks.embedding` 列一致；见 [LLM-IMPLEMENTATION.md](./LLM-IMPLEMENTATION.md) v2.3 §1.3。
- 完成后：`stage.has_knowledge_base = true`。

### 8.2 Retrieve

- 条件：仅当 `has_knowledge_base=true`。
- 触发：
  - M3 课堂讨论（规划中的 SSE `/api/chat`）用户消息；
  - 大纲生成时（有 KB）：对 `requirement` 或 PDF 主题做 retrieve；
  - Phase 2 Planner 阶段（可选）：为 `sceneOutlines（蓝图）.sourceHints` 提供素材引用。
- 无知识库：`retrieve` 返回 `[]`，不报错。
- topK：5～8；可选相似度阈值（如 cosine > 0.7）。
- 过滤：**必须**带 `stage_id`，防止跨课堂泄漏。

**Prompt 注入模板**（有知识库时）：

```markdown
## Reference Material
[1] (p.3) ...
[2] (p.7) ...
Prefer references when answering factual questions. Cite [n].
If the answer is not in references, say so and use course content.
```

### 8.3 前端展示

- **有引用**：助手消息下方「参考来源」——页码 + 片段摘要，可展开全文。
- **无知识库**：不展示引用区；可选角标「基于课程内容」。

### 8.4 SourceRef 结构

```typescript
interface SourceRef {
  chunkId: string;
  page?: number;
  excerpt: string;      // 展示用摘要，约 120 字
  score?: number;
}
```

---

## 9. 播放模块

### 9.1 行为

- 读取 `scenes[].actions`，按序执行。
- `speech`：更新字幕区；`estimateReadDuration(text)` 后自动下一步。
- `discussion`：暂停播放；弹「是否加入讨论」；确认后聚焦讨论面板。
- `quiz`：暂停自动播放；展示答题 UI；提交后可调 `/api/quiz-grade`。
- 场景切换：重置播放状态；可选结束当前 chat session。

### 9.2 阅读节奏（无 TTS）

```typescript
// 参考 OpenMAIC PlaybackEngine 的 reading timer
// CJK 约 150ms/字，英文约 240ms/词
function estimateReadDuration(text: string): number;
```

### 9.3 明确不做

- TTS、音频同步、`live` 引擎复杂态。
- 白板、聚光灯、激光笔等 action 在 MVP 可保留类型但 **no-op**（Phase 2 再接 ActionEngine）。

---

## 10. 非功能需求

| 类别 | 要求 |
|------|------|
| 性能 | 首屏 scene P95 < 60s（视模型） |
| 安全 | API Key 仅服务端；PDF ≤ 50MB；上传类型校验 |
| 隐私 | 课程数据按 `course_id` 隔离；RAG 检索强制 `course_id` 过滤 |
| 可观测 | 结构化日志：courseId、sceneId、retrieveMs、tokenUsage、`generation_session_id`、`revisionCount`、`directorDecision` |
| 可用性 | 生成失败可重试单页；ingest 失败可提示补提示词 |
| 许可 | 独立仓库；参考 OpenMAIC 架构须在 README 致谢 |

---

## 11. 里程碑

| 阶段 | 周期 | 交付 |
|------|------|------|
| M0 | 3 天 | 仓库脚手架、Postgres+pgvector、Drizzle schema、Docker Compose |
| M1 | 1 周 | 可选 PDF ingest + embedding 管道（**无**独立 chat HTTP；讨论见 M3） |
| M2 | 1 周 | 大纲 SSE + slide 生成 + 课堂播放壳 |
| M2+ | 3～4 天 | 大纲编辑助手（§3.1.2）：`POST /api/chat（config.sessionType: 'outline'）` + Tool + preview 侧栏 |
| M3 | 1 周 | quiz 场景 + 固定 3 Agent Director |
| M4 | 3 天 | 续生成、错误重试、`SettingsDialog`、README + 演示录屏 |

**Phase 2（MVP 完成后，非当前排期）**

| 阶段 | 周期 | 交付 |
|------|------|------|
| P2a | 1 周 | Planner + Plan 表格 + 冻结 / 重新规划 API |
| P2b | 3～4 天 | Drafter + Critic + Director 循环（**无 replan**）+ SSE Round UI |
| P2c | 2 天 | `revisionCount` 超限失败态 + Critic 规则预检 |
| P2d | 2 天 | `eval/outline-orchestration` + 文档 |

详见 [3.5 节](#35-phase-2-拓展冻结-plan--大纲评审闭环非-mvp)。

---

## 12. 风险与缓解

| 风险 | 缓解 |
|------|------|
| LLM 大纲 JSON 不稳定 | jsonrepair + 最多 2 次重试 |
| 有 PDF 时大纲偏离教学目标 | 大纲 prompt 固定注入 `requirement` + RAG；`languageDirective` 供用户确认 |
| RAG 召回差 | 调 chunk/overlap；大纲阶段也 retrieve |
| 生成成本高 | 首屏优先；续生成串行；embedding 结果缓存 |
| 代码膨胀 | `lib/scenes/registry` 插件化；`lib/config/features.ts` 双开关：`outlineOrchestration`、`outlineAssistant` |
| Phase 2 评审死循环 | `revisionCountMax` 默认 3；超限 **报错退出**（§3.5.5）；Director 仅 `redraft` \| `approve` |
| Plan 冻结后结构不合理 | 「重新规划」解冻；Critic `requiresReplan` 仅提示，不自动改 Plan |
| 大纲助手与 Plan 不一致 | 策略 A：确认前可选警告，不阻断（§3.1.2.2） |

---

## 13. 附录

### 13.1 SceneOutline 类型（MVP 子集）

与 OpenMAIC `lib/types/generation.ts` 对齐，约束如下：

- `type` 仅允许 `"slide"` | `"quiz"`。
- 去掉 `interactiveConfig`、`pblConfig`、`widgetType`、`mediaGenerations`。
- 保留 `id`、`title`、`description`、`keyPoints`、`order`、`teachingObjective`、`estimatedDuration`、`languageNote`、`quizConfig`、`suggestedImageIds`（有 PDF 时）。

### 13.2 大纲响应 JSON 示例（完整课程）

```json
{
  "languageDirective": "全程使用简体中文授课。术语首次出现时可附英文原文。",
  "outlines": [
    {
      "id": "scene_1",
      "type": "slide",
      "title": "React Hooks 简介",
      "description": "介绍 Hooks 解决的问题与基本规则。",
      "keyPoints": [
        "类组件 vs 函数组件的状态管理痛点",
        "useState 的最小示例",
        "Hooks 调用规则（顶层、仅在 React 函数中）"
      ],
      "teachingObjective": "理解为何需要 Hooks",
      "estimatedDuration": 180,
      "order": 1
    },
    {
      "id": "scene_2",
      "type": "slide",
      "title": "useState 与 useEffect",
      "description": "讲解两个最常用 Hook 的用法与注意点。",
      "keyPoints": [
        "useState 更新是异步的",
        "useEffect 依赖数组的含义",
        "清理函数的使用场景"
      ],
      "order": 2
    },
    {
      "id": "scene_3",
      "type": "quiz",
      "title": "Hooks 小测验",
      "description": "检验对 useState 与 useEffect 的理解。",
      "keyPoints": [
        "单选：依赖数组为空时的行为",
        "简答：何时需要 useEffect 清理函数"
      ],
      "order": 3,
      "quizConfig": {
        "questionCount": 2,
        "difficulty": "medium",
        "questionTypes": ["single", "text"]
      }
    }
  ]
}
```

### 13.3 slide 场景 content + actions 示例（片段）

**content**（`GeneratedSlideContent` 简化）：

```json
{
  "elements": [
    {
      "id": "el_1",
      "type": "text",
      "left": 80,
      "top": 60,
      "width": 800,
      "height": 80,
      "content": "<h1>React Hooks 简介</h1>"
    },
    {
      "id": "el_2",
      "type": "text",
      "left": 80,
      "top": 160,
      "width": 800,
      "height": 300,
      "content": "<ul><li>解决类组件逻辑复用困难</li><li>useState 管理局部状态</li></ul>"
    }
  ],
  "background": { "type": "solid", "color": "#ffffff" }
}
```

**actions**（播放时间线）：

```json
[
  {
    "id": "action_1",
    "type": "speech",
    "text": "大家好，今天我们学习 React Hooks。它让函数组件也能使用状态……"
  },
  {
    "id": "action_2",
    "type": "discussion",
    "topic": "你在项目中用过哪些 Hooks？",
    "agentId": "student-a"
  }
]
```

### 13.4 quiz 场景 content 示例（片段）

```json
{
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "stem": "useEffect 依赖数组为 [] 时，effect 何时执行？",
      "options": [
        { "id": "a", "text": "每次渲染后" },
        { "id": "b", "text": "仅挂载后一次" },
        { "id": "c", "text": "从不执行" }
      ],
      "answer": ["b"]
    },
    {
      "id": "q2",
      "type": "text",
      "stem": "简述什么情况下需要在 useEffect 中返回清理函数。",
      "answer": "订阅、定时器、手动 DOM 监听等需要在组件卸载或依赖变更前释放资源时。"
    }
  ]
}
```

### 13.5 固定 Agent 配置示例（`config/agents.json`）

```json
[
  {
    "id": "teacher",
    "name": "王老师",
    "role": "teacher",
    "persona": "耐心、结构化讲解，善于用类比。",
    "avatar": "/avatars/teacher.png",
    "color": "#4F46E5",
    "priority": 10
  },
  {
    "id": "student-a",
    "name": "小明",
    "role": "student",
    "persona": "好奇，爱问「为什么」。",
    "avatar": "/avatars/curious.png",
    "color": "#059669",
    "priority": 5
  },
  {
    "id": "student-b",
    "name": "小红",
    "role": "student",
    "persona": "严谨，喜欢举反例巩固理解。",
    "avatar": "/avatars/thinker.png",
    "color": "#D97706",
    "priority": 4
  }
]
```

### 13.6 OpenMAIC 参考实现映射

| MindFlow 模块 | OpenMAIC 参考路径 |
|---------------|-------------------|
| 首页 | `app/page.tsx` |
| 生成预览页 | `app/generation-preview/page.tsx` |
| PDF 解析 | `app/api/parse-pdf/route.ts` |
| 大纲流 | `app/api/generate/scene-outlines-stream/route.ts` |
| 场景生成 | `app/api/generate/scene-content/route.ts`、`app/api/generate/scene-actions/route.ts` |
| Director | `lib/orchestration/director-graph.ts` |
| Agent 循环 | `lib/chat/agent-loop.ts` |
| 课堂页 | `app/classroom/[id]/page.tsx`、`components/stage.tsx` |
| 设置弹窗 | `components/settings/index.tsx`（`SettingsDialog`） |
| 类型定义 | `lib/types/generation.ts`、`lib/types/action.ts` |

> **不参考**：OpenMAIC Pro 的 `lib/server/agent-runtime/`、pi-agent-core、Workbench Session（见 §3.4）。

### 13.7 Phase 2 / M2+ Backlog（摘录）

- **冻结 Plan + 大纲评审闭环**（§3.5）——Planner → 用户冻结 Plan → Drafter / Critic / Director（**无 replan**）
- **大纲编辑助手**（§3.1.2，M2+）——AI SDK Tool Calling，策略 A 软约束
- Agent 自动生成（`agent-profiles`）
- TTS 讲稿朗读
- `interactive` 场景类型
- 课堂导出、简易幻灯片编辑
- 浏览器 IndexedDB 离线缓存
- 联网搜索增强大纲

### 13.8 功能开关（`lib/config/features.ts` 建议）

```typescript
export const features = {
  editMode: false,
  tts: false,
  mediaGeneration: false,
  webSearch: false,
  agentAutoGenerate: false,
  outlineOrchestration: false, // Phase 2：冻结 Plan + 评审闭环；MVP 保持 false
  outlineAssistant: false,     // M2+：大纲编辑助手 Tool Chat
  revisionCountMax: 3,         // Phase 2：Critic 循环上限，超限报错退出
  sceneTypes: ['slide', 'quiz'] as const,
  rag: true,
};
```

### 13.9 生成域三轨示意（MVP / M2+ / Phase 2）

```mermaid
flowchart TB
  subgraph mvp [MVP_M2]
    R[requirement]
    O1[scene-outlines-stream单次LLM]
    R --> O1
  end

  subgraph m2plus [M2plus_3_1_2]
    OA[POST /api/chat（config.sessionType: 'outline'）_Tool助手]
  end

  subgraph p2 [Phase2_3_5]
    PL[Planner]
    U[用户编辑并冻结Plan]
    D[Drafter]
    C[Critic]
    DIR[Director_redraft_or_approve]
    PL --> U --> D --> C --> DIR
    DIR -->|redraft| D
    DIR -->|approve| Done[done]
    DIR -->|revisionCount超限| Err[error退出]
  end

  O1 --> OA
  Done --> OA
```

- MVP：`outlineOrchestration=false`，`outlineAssistant` 可选。
- Phase 2：`outlineOrchestration=true`；**无** Director→Planner `replan` 边。
- 课堂讨论（M3）为 **独立编排域**，不在上图。

### 13.10 Agent 能力映射（求职 / 实现对照）

| 能力 | 实现位置 | 技术 |
|------|----------|------|
| Plan-and-Execute | Phase 2 阶段 A→B | `generateObject` + 冻结 Plan |
| Critic 闭环 | Phase 2 阶段 B | `outline-generator.ts` + `scene-outlines-stream` SSE |
| 有界循环 | `revisionCountMax` | 超限 SSE `REVISION_LIMIT_EXCEEDED` |
| Tool Calling | M2+ 大纲助手 | AI SDK `streamText` + tools |
| 多 Agent 讨论 | M3 classroom | LangGraph Director + 无状态 `/api/chat` |
| RAG | M1 ingest + M3 chat | pgvector retrieve |
| Human-in-the-loop | Plan 冻结 + 策略 A | 用户确认 Plan；大纲可偏离 Plan |

---

### 13.11 OpenMAIC 命名对齐表

MindFlow 在 Postgres 持久化层扩展 OpenMAIC 客户端类型，**不另起模块名/类型名**：

| OpenMAIC（原项目） | MindFlow 持久化 / 用法 |
|--------------------|------------------------|
| `Stage`（`lib/types/stage.ts`） | `stage` 表一行 |
| `UserRequirements`（`lib/types/generation.ts`） | `stage.requirement` + 可选 nickname 等（sessionStorage） |
| `SceneOutline` | `stage.outlines` JSONB 数组元素；Plan 蓝图存 `stage.scene_outlines` |
| `SceneOutline[]` / `sceneOutlines` | API 字段名 `sceneOutlines` ↔ DB `scene_outlines` |
| `GenerationSessionState.previewPhase` | `stage.preview_phase`（枚举值完全一致） |
| `languageDirective` | `stage.language_directive` |
| IndexedDB `stageOutlines` + `scenes` | `stage.scene_outlines` + `stage.outlines` + `scenes` 表 |
| `ChatSession` + 内嵌 messages | `chat_sessions` + `chat_messages` |
| `generateSceneOutlinesFromRequirements` | `lib/generation/outline-generator.ts` |
| `POST /api/generate/scene-outlines-stream` | 同路径；`outlineOrchestration` / `phase` 为 MindFlow body 扩展 |
| `POST /api/generate/scene-content` | 同路径 |
| `POST /api/generate/scene-actions` | 同路径 |
| `POST /api/chat` | 同路径；`config.sessionType` 扩展 `'outline'`（M2+） |
| `DirectorState`（`lib/types/chat.ts`） | 课堂讨论客户端维护；**不**用于大纲评审循环 |
| `useSceneGenerator().generateRemaining` | 客户端续生成；**无** `/api/.../generateRemaining` |
| `OutlinesEditor` | `components/generation/outlines-editor.tsx` |
| `lib/orchestration/director-graph.ts` | **仅**课堂讨论 LangGraph |
| Phase 2 大纲评审 | `outline-generator.ts` + `scene-outlines-stream/route.ts`（**不**新建 `outline-graph.ts`） |
| Agent 人设 | `config/agents.json`（**不**建 `agents` 表） |


---

*文档结束*
