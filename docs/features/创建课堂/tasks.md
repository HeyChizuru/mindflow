---
feature_id: 创建课堂
artifact: tasks
implements: [CC-1, CC-2, CC-3, CC-4, CC-5, CC-6]
governed_by: [adr-004]
---

# 创建课堂 — 前端实施任务（M1）

对应 [spec](./spec.md)（`delivery_status: verified`）；后端 M0 已就绪，见 [plan](./plan.md)。阶段 A/B/C 与 V-1～V-5 已完成。

**执行顺序（分三次交付，不要跳步）：**

1. **阶段 A — 删减**：从开源首页去掉与本项目无关的能力，保证能编译、首页仍能打开。
2. **阶段 B — 静态页**：只搭 UI 与本地状态（不接 `POST /api/stages`），在浏览器里能点、能填、能看布局。
3. **阶段 C — 联调**：接 API、校验、跳转与预览占位，按 spec「验证」表做手工验收。

---

## 阶段 A — 删减（先做）

目标：保留可作布局参考的壳，删掉 MindFlow 不需要的逻辑与依赖，避免一边改 UI 一边踩缺失模块。

参考 [plan](./plan.md)「与开源首页的差异」，从 `app/page.tsx`（及仅被首页引用的子组件）移除：

- [x] **A-1** 历史课堂：`listStages` / `stage-storage`、`ClassroomCard`、搜索、删除/重命名、缩略图 / `ThumbnailSlide` / `useMediaGenerationStore`。
- [x] **A-2** 导入与扩展能力：ZIP `useImportClassroom`、`webSearch`、`interactiveMode`、`SpeechButton`、`AgentBar`。
- [x] **A-3** 错误建课路径：`sessionStorage.generationSession`、`storePdfBlob` / pdfProvider、`nanoid` 假会话、无课堂 id 的 `/generation-preview` 跳转。
- [x] **A-4** 重型设置与 i18n：移除 `SettingsDialog`、`LanguageSwitcher`、完整开源 `GenerationToolbar`；保留 MVP 中文 `lib/hooks/use-i18n.ts` 与仅 PDF 的 `components/generation/generation-toolbar.tsx`。
- [x] **A-5** 模型门禁：`hasUsableLLMProvider` 控制「开始生成」（本单元 spec 不要求；全链路后由配置模型接）。
- [x] **A-6** 删完后首页仍能渲染（字段可暂留占位，下一阶段再收束）。本阶段不要求 `pnpm lint`。

`maps: —`（为 B/C 清场；间接支撑 CC-5、CC-6）

---

## 阶段 B — 静态页面（再接）

目标：满足 spec「首页须提供」的**界面与本地交互**，提交按钮可先 `console.log` 或 toast「联调待接」，**不调用** `POST /api/stages`。

### B.1 全局与主题

- [x] **B-1** `components/providers/theme-provider.tsx` + `lib/hooks/use-theme.ts`；[`app/layout.tsx`](../../../app/layout.tsx) 包裹 `ThemeProvider`。
- [x] **B-2** 顶栏：主题切换；设置按钮占位（toast「模型设置开发中」）。

### B.2 首页版面与文案

- [x] **B-3** 品牌：`/mindflow-logo.svg`、中文 slogan、页脚 MindFlow。
- [x] **B-4** 课程需求 `textarea`（占位与样式）；可选保留 motion / 渐变。
- [x] **B-5** PDF 区：选择文件、展示文件名、清除（仅 UI + 本地 `File | null`，校验文案可先写死占位）。
- [x] **B-6** 「开始生成」按钮：静态态 disabled / enabled 规则可先按「有非空需求」近似，**不接** API。

### B.3 学习者画像（仅本地）

- [x] **B-7** `lib/store/user-profile.ts`（Zustand persist）+ `app/page.tsx` 内 `GreetingBar`（昵称、背景、头像仅本地；头像不进 API）。
- [x] **B-8** 首页集成 `GreetingBar`；`lib/hooks/use-draft-cache.ts`（`requirementDraft`）与需求框同步。

### B.4 预览占位（静态）

- [x] **B-9** [`app/generation-preview/[id]/page.tsx`](../../../app/generation-preview/[id]/page.tsx)：展示「开发中」与 URL 中的 `id`（仍不调 ingest / 大纲）。

- [x] **B-10** 浏览器自测：能打开 `/`，填字、选 PDF、展开昵称/背景、切换主题；`pnpm lint` 通过（`no-img-element` 为 warning，阶段 B 可接受）。

`maps: CC-2`（画像 UI）；其余 CC 在阶段 C 验收

---

## 阶段 C — 联调（最后做）

目标：静态页接上 M0 接口，完成 spec 全部验收 ID。

### C.1 API 客户端

- [x] **C-1** [`lib/client/stages/`](../../../lib/client/stages/)（`create-stage.ts` 等）：`createStage(requirements, pdf?)`（JSON / multipart、错误与 `stageResponseSchema`）。
- [x] **C-2** 禁止在页面 import `lib/services` / `lib/db`。

### C.2 提交与校验

- [x] **C-3** 提交前 `stageRequirementsSchema.safeParse`；PDF 客户端校验（类型 / 非空 / 50MB，中文错误）。
- [x] **C-4** 成功：`router.push(\`/generation-preview/${stage.id}\`)`；失败：展示 API `error`；`submitting` 防重复。
- [x] **C-5** `canSubmit` = 校验通过且非 submitting（不接模型门禁）。

### C.3 手工验收（spec「验证」表）

- [x] **V-1** 无 PDF：≥10 字 → 201 → `/generation-preview/{uuid}`；读回相同 `requirements`。（CC-1, CC-5）
- [x] **V-2** 昵称/背景组合读回。（CC-2）
- [x] **V-3** 合法 PDF multipart；`hasKnowledgeBase` 为 `false`。（CC-3）
- [x] **V-4** 非法输入：可理解错误，无半成品课堂。（CC-4, CC-6）
- [x] **V-5** `pnpm lint`。

---

## 不在本任务单

- 配置模型弹窗与首页模型门禁（[[配置模型]]）。
- 预览页 ingest、流式大纲（[[文档入库]]、[[流式大纲与手改]]）。
- 首页历史列表、列表 API。
