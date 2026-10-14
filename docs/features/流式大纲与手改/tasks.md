---
feature_id: 流式大纲与手改
artifact: tasks
implements: [OL-1, OL-2, OL-3, OL-4, OL-5, OL-6]
governed_by: [adr-004, adr-005]
---

# 流式大纲与手改 — 前端实施任务

对应 [spec](./spec.md)（`delivery_status: verified`）；后端 M1–M6 已就绪，见 [plan](./plan.md)。阶段 A/B/C 与 V-1～V-5 已完成。

**执行顺序（分两次交付，不要跳步）：**

1. **静态**：先阶段 A 删掉开源无关模块，再阶段 B 用本地假数据把大纲卡片和编辑器搭出来。此阶段不调用大纲 SSE。
2. **联调**：阶段 C 接上已有课堂读取与 `POST /api/generate/scene-outlines-stream`。

项目只有三条路由：首页 `/`、生成页 `/generation-preview/[id]`、播放页（后续）。本单元的生成页只做到流式大纲和手改。后续单元在这个生成页只接第 1 个场景的幻灯片内容与 actions（含 speech，不含 TTS）；其余场景不在生成页续生成，由播放页后台续生成。见 [intent](../../intent.md) 的「页面」。

---

## 阶段 A — 删减（静态的第一步）

目标：生成页能打开，且不再依赖本产品明确不做的模块。开源原文先整份留档。第 1 个场景的幻灯片与动作仍属于这条生成页的后续步骤，删减时不要把它们挪到播放页；其余场景的续生成留在播放页。

### A.1 留档

- [x] **A-1** 将下列文件原样拷到 `reference/openmaic-generation-preview/`，并在 `tsconfig.json` 的 `exclude` 加入该目录：
  - `app/generation-preview/[id]/page.tsx`
  - `app/generation-preview/[id]/types.ts`
  - `app/generation-preview/[id]/components/visualizers.tsx`
  - `components/generation-preview/outlines-editor.tsx`
  - 若 `app/generation-preview/` 下还有未挂进 `[id]` 的重复拷贝，一并拷入参照目录。
- [x] **A-2** 当前路由不 import `reference/`。参照目录不参与编译。

`maps: —`（为后续单元留原文）

### A.2 从当前预览页去掉无关模块

文件：`app/generation-preview/[id]/page.tsx`。

- [x] **A-3** 从当前 `page.tsx` 去掉 PDF 扫描、联网搜索、Agent 人设、TTS、图片/视频、IndexedDB 图片、`AgentRevealModal`。第 1 个场景的内容与 actions 调用不在本单元执行，原文留在参照目录的 `page.tsx`；后续单元只把「第 1 个场景」写回 `/generation-preview/[id]`。对其余大纲的续生成不写回生成页。
- [x] **A-4** 去掉 `sessionStorage` 的 `generationSession`、客户端 `nanoid` 建课，以及请求体里的 `requirements` / `pdfText` / `pdfImages` / `researchContext`。
- [x] **A-5** 去掉开源请求头（`x-api-key`、`x-model`、图片头、视频头）和对 `useSettingsStore`、`@/lib/types/generation`、`@/lib/store/settings` 等缺失模块的 import。
- [x] **A-6** 本单元进度点只点亮大纲一步。不渲染「确认大纲」按钮，因此不会在本单元进入第 1 个场景的幻灯片或动作生成。确认按钮的样式与「只生成第 1 个场景」的调用留在参照目录，供同一生成页的下一单元接上。
- [x] **A-7** `app/generation-preview/[id]/types.ts`：去掉开源 `GenerationSessionState`（PDF、联网、Agent、`useSettingsStore`）。页面不再依赖该文件时，删除它。

`maps: —`（清场；未排期的是第 1 个场景，仍属于生成页。其余场景的续生成不在本页）

### A.3 可视化与编辑器（留档之后改原路径）

这两个文件各有两份：`reference/openmaic-generation-preview/` 里是删减前的全文；下面的原路径是当前路由要用的那份，在原文上删减。预览页改为 import 原路径上的这两份，不再引用不存在的 `@/components/generation/outlines-editor`。

- [x] **A-8** `app/generation-preview/[id]/components/visualizers.tsx` 留在生成页目录。删掉 PDF、联网、Agent 可视化。幻灯片内容与动作可视化留在这个文件，供后续在同一页点亮第 1 个场景的那两步；其中 PBL、interactive 画面删掉，只保留 slide / quiz。本单元进度点不切到这两步。`SceneOutline` 改为 `@/lib/types/outline`。被删掉的无关可视化仍在参照目录的同名文件里。
- [x] **A-9** `components/generation-preview/outlines-editor.tsx`：当前路由继续用这个编辑器。`SceneOutline` 改为 `@/lib/types/outline`。场景类型只留 `slide` 与 `quiz`，去掉 `interactive`、`pbl` 及对应菜单。去掉「始终审查」等依赖开源设置 store 的控件。确认按钮本单元不渲染。增删、调序、改标题/描述/要点的界面留在这个文件里。

### A.4 删完可打开

- [x] **A-10** 访问 `/generation-preview/{任意 id}` 能打开，且不发起大纲请求。本阶段不要求 `pnpm lint`。

`maps: —`

---

## 阶段 B — 静态页面（删减之后）

目标：用本地假数据走通大纲阶段的界面与手改。提交与重试可先不发请求。

假数据至少两条：一条 `slide`，一条带 `quizConfig` 的 `quiz`。类型用 `@/lib/types/outline` 的 `SceneOutline`。

### B.1 流式卡片

- [x] **B-1** 保留开源画面：渐变背景、返回首页、单个进度点、居中毛玻璃卡片、`StreamingOutlineVisualizer`、底部「AI 正在工作」。
- [x] **B-2** 卡片列出假数据大纲。用本地标记模拟「仍在流式」：流式时编辑器只读。
- [x] **B-3** 点击卡片展开编辑器；折叠回到小卡片。展开期间假数据列表保持不变。

### B.2 手改

文件：`components/generation-preview/outlines-editor.tsx`，状态留在预览页。

- [x] **B-4** 可改已有场景的标题、描述、要点。改动只在页面状态里。
- [x] **B-5** 可上移、下移、拖拽调整顺序。重排 `order`（从 1 起）。不改动各场景的 `type` 与 `quizConfig`。
- [x] **B-6** 可新增、删除场景。新增默认 `slide`（空标题、空描述、空要点）。另可新增 `quiz`，并带上 `quizConfig`：`questionCount: 2`、`difficulty: "medium"`、`questionTypes: ["single"]`。
- [x] **B-7** 已有场景不能改 `type`，也不能改已有 `quizConfig`。

`maps: OL-2, OL-6`（界面；联调后再对着真实列表验收）

### B.3 错误占位

- [x] **B-8** 卡片上保留开源的失败样式：可理解的错误文案和重试按钮。此阶段重试只复位本地错误标记，不发请求。

### B.4 静态自测

- [x] **B-9** 大纲、手改、授课语言指令都不写入 `sessionStorage` 或数据库。
- [x] **B-10** 浏览器自测：打开预览页，看到假数据卡片，展开后改字段、调序、增删 slide/quiz，折叠再展开数据仍在；`pnpm lint` 通过。

---

## 阶段 C — 联调（最后做）

目标：撤掉假数据，接上已保存课堂与 SSE。页面不 import `lib/services`、`lib/db`。

### C.1 客户端

- [x] **C-1** `lib/client/stages` 增加按 id 读取：`GET /api/stages/{id}`，用现有 `stageResponseSchema` 校验。失败抛出可读错误（含 404）。
- [x] **C-2** 测试阶段在 `lib/client` 用常量组装请求头，不读 localStorage，不新增设置界面。无知识库只带对话三头；`hasKnowledgeBase === true` 时再带向量三头。常量只放代码里，不写进文档。项目跑通后，由首页（[[配置模型]]）校验用户是否已配置模型，再改为按下述键名从 localStorage 读取。键名与头名仍按此约定，本单元不实现读取：
  - 对话：`mindflow.llm.chat.apiKey`、`mindflow.llm.chat.baseUrl`、`mindflow.llm.chat.model`
  - 向量：`mindflow.llm.embedding.apiKey`、`mindflow.llm.embedding.baseUrl`、`mindflow.llm.embedding.model`
  - 对应头：`x-mindflow-llm-chat-*`、`x-mindflow-llm-embedding-*`。
- [x] **C-3** 大纲流客户端：`POST /api/generate/scene-outlines-stream`，body 仅 `{ stageId }`。解析 SSE：`languageDirective`、`outline`、`done`、`error`，以及可选的 `retry`。`retry` 清空已收集条目。

`maps: OL-1, OL-3, OL-5`

### C.2 接到页面

- [x] **C-4** 用路由上的课堂 id 读课堂。成功后开流，用真实 `outline` 事件替换假数据；每条到达即追加到卡片。`languageDirective` 留在页面状态。
- [x] **C-5** 请求头用 C-2 的常量。`hasKnowledgeBase === false` 时不带向量头。为 `true` 时带齐向量三头。本单元不因「用户尚未配置模型」拦截 POST；该校验留给首页（[[配置模型]]）。
- [x] **C-6** 流结束后编辑器可手改（沿用 B-4～B-7）。手改不调模型，不写库。
- [x] **C-7** 刷新或再次打开该 id：只恢复课堂需求与资料，丢掉本次大纲、手改和授课语言指令，并重新开流。
- [x] **C-8** HTTP 错误与 SSE `error` 停在当前页，展示接口返回的 `error`（不含堆栈或密钥）。重试用同一套写死的请求头再 POST 一次。

`maps: OL-1, OL-2, OL-3, OL-4, OL-5, OL-6`

### C.3 手工验收

- [x] **V-1** 无知识库：建课后进入预览，带齐对话头，逐条出现且仅为 slide/quiz。数据库 `outlines` / `language_directive` 不变。（OL-1）
- [x] **V-2** 流结束后改标题、描述、要点；调序；新增 slide 与 quiz；删除一条。其余场景的类型与 `quizConfig` 不变。刷新后这些修改消失并重新生成。（OL-2、OL-6、OL-4）
- [x] **V-3** 知识库已就绪且带另一套向量头：可以开流。无知识库时不要求向量头。（OL-3）
- [x] **V-4** 假 id、模型无可解析大纲：可理解错误，可重试，不写大纲。缺对话配置、知识库已就绪但缺向量配置时，服务端仍拒绝（见 [plan](./plan.md) 的请求头契约）；本单元页面因请求头写死，不覆盖这两条。首页是否已配置模型的校验不在本单元。（OL-5）
- [x] **V-5** `pnpm lint` 通过。

---

## 不在本任务单

- 确认大纲、写入 `stage.outlines` / `languageDirective`、生成场景（[[确认大纲并生成首屏]]）。
- 文档解析与入库（[[文档入库]]）。有 PDF 但 `hasKnowledgeBase` 仍为 false 时，本页仍只按已保存需求开流。
- 模型设置界面，以及从 localStorage 组装请求头（[[配置模型]]）。本单元测试阶段把请求头写死。项目跑通后，首页校验用户是否已配置模型，再改为读取 `mindflow.llm.chat.*` 与 `mindflow.llm.embedding.*`。
- 在生成页接上确认大纲，并只生成第 1 个场景的幻灯片内容与含 speech 的 actions（[[确认大纲并生成首屏]]）。不在生成页接 [[后台续生成]]。
- 播放页按 actions 播放，并在该页后台续生成其余场景（[[课堂播放与测验]]、[[后台续生成]]）。
- TTS、Agent 人设、联网与 AI 媒体。参照目录里有原文，本产品当前不做。
