---
feature_id: 课堂播放与测验
artifact: tasks
implements: [CP-1, CP-2, CP-3, CP-4, CP-5, CP-6, CP-7, CP-8, CP-9, CP-10, CP-11, CP-12, CP-13]
governed_by: [intent, adr-001, adr-002, adr-003, adr-004, adr-005]
---

# 阶段二：范围清理

依据 [spec](./spec.md)、[plan 阶段二](./plan.md#阶段二范围清理) 和 [源码盘点](./源码盘点.md)，按本轮对齐的范围收窄调用链，留下后续可适配的课堂播放与测验骨架。本 task 待审阅，实施项均未完成；spec 仍标为 draft，本文件不改变功能承诺或表示实现已获验收。

## 目标与实施边界

清理明确非目标能力，解除真实讨论、后台续生成与旧浏览器权威存储的运行耦合；保留幻灯片展示、字幕、播放控制、教学动作、三类题目和反馈展示的结构。

- 当前代码基线为 `432d687fab94620decd4190fc163e9e4d55b1652`。盘点的 `cdbf5f0` 是历史快照，两者代码差异仅为草稿 hook 的 `copy` 副本已移除，不再把它列为待删除文件；实施前复核实际工作区。
- PostgreSQL 读取、位置保存、逐题提交、服务端判分、批改恢复及并发设计留到阶段三；完整页面状态和视觉适配留到阶段四；自动播放、下一段、重播、教学效果落点及真实联调留到阶段五。
- 本阶段允许修正保留代码的路径、类型引用、调用签名及必要接线；不以空函数、假数据或成功响应维持已解除的读取、保存和提交契约。未接入能力须如实标明不可用，临时骨架不作为正式使用流程验收。
- 不安装依赖，不修改数据库、服务端 API、生成链路、模型配置协议、spec、ADR 或 AGENTS.md；不扩展到整仓源码清理。沿用现有文件组织，不新增实现文件或进行组件搬迁、重命名。

## 文件范围

以下路径均相对仓库根目录。修改限于所列职责，不要求每个保留文件都产生 diff。

### 修改与收窄

- **入口与外壳**：`app/classroom/[id]/page.tsx`、`components/stage.tsx`、`components/edit/PlaybackChromeRoot.tsx`、`components/header.tsx`。移除生成、媒体、自动 Agent 恢复、编辑切换及真实聊天接线，留下课堂挂载、标题、字幕和播放生命周期。主题复用根布局已有提供者，不再从 use-theme hook 错误导入 ThemeProvider。
- **画布、控制与目录**：`components/canvas/canvas-area.tsx`、`components/canvas/canvas-toolbar.tsx`、`components/stage/scene-sidebar.tsx`、`components/stage/scene-renderer.tsx`。清理白板、音量、语音、自动翻页、聊天操作、缩略图及 interactive/PBL 分支；保留 slide/quiz 分发、前后场、目录和状态展示位置。
- **页面状态与场景订阅**：`lib/store/stage.ts`、`lib/store/canvas.ts`、`lib/contexts/scene-context.tsx`。保留当前课堂、场景、目录、当前位置、视口和临时教学效果；移除编辑写回、生成操作、旧存储调用及富文本初始化依赖。
- **播放与动作执行**：`lib/playback/engine.ts`、`lib/playback/types.ts`、`lib/playback/derived-state.ts`、`lib/action/engine.ts`。解除音频、live 聊天、白板、视频、原项目 stage-api、iframe sender 和浏览器快照存储依赖；保留有序执行、已有阅读计时、字幕与动作回调及清理结构。`lib/playback/index.ts` 保留现有统一导出结构。
- **展示入口与视口**：`components/slide-renderer/Editor/index.tsx`、同目录 `ScreenCanvas.tsx`、`ScreenElement.tsx`、`HighlightOverlay.tsx`、`SpotlightOverlay.tsx`，以及 `components/slide-renderer/hooks/useViewportSize.ts`。解除缺失的编辑 Canvas 和非目标元素导入，修正已有视口 hook 的引用；仅做保留链路需要的类型衔接。
- **测验与共享工具**：`components/scene-renderers/quiz-view.tsx`、`lib/quiz/grading.ts`、`lib/utils/element.ts`。保留题型与反馈展示、纯答案比较、线条路径和必要几何计算；解除正式本地判分、保存、旧批改请求及语音输入，清理无消费的复制／对齐编辑工具。表格候选仍用到的配色函数保留。
- **最少必要文案**：`lib/hooks/use-i18n.ts`。只补清理后必要的可理解提示，不展开完整课堂文案、页面视觉或多语言系统。

### 解除调用后删除：9 个文件

1. `components/edit/use-edit-mode-lock.ts`
2. `lib/contexts/media-stage-context.tsx`
3. `components/slide-renderer/components/element/ProsemirrorEditor.tsx`
4. `components/slide-renderer/components/element/ChartElement/index.tsx`
5. `components/slide-renderer/components/element/LatexElement/index.tsx`
6. `components/slide-renderer/components/element/LineElement/index.tsx`
7. `components/slide-renderer/components/element/ShapeElement/index.tsx`
8. `components/slide-renderer/components/element/TableElement/index.tsx`
9. `components/slide-renderer/components/element/TextElement/index.tsx`

实施前重新检查静态导入、re-export 和字面量动态导入。六个元素包装当前没有消费引用；ProsemirrorEditor 只被 Text/Shape 包装引用；锁 hook 和媒体 provider 分别先从 Stage、课堂页解除。保留直接被 ScreenElement 使用的 Base 展示组件，不按目录整体删除。

### 暂保留，不在本阶段改造

- **旧存储源码**：`lib/utils/database.ts`、`lib/utils/stage-storage.ts`、`lib/quiz/persistence.ts`。退出正式播放调用链，暂留给阶段三统一处理；不把它们改成另一套缓存，不执行浏览器清库或记录迁移。
- **代码块与表格候选**：`CodeElement/BaseCodeElement.tsx`、`TableElement/BaseTableElement.tsx`、`TableElement/StaticTable.tsx`、`TableElement/tableUtils.ts`，均位于 `components/slide-renderer/components/element/`。保留源码但从当前元素分发解除引用，不新增 shiki、表格数据或生成能力。
- **展示共享基础**：必需元素 Base、描边、SVG 渐变／图案、四个样式 hook、`lib/utils/create-selectors.ts`、`lib/hooks/use-slide-background-style.ts`、`lib/utils/geometry.ts` 和 `lib/types/slides.ts`。不随编辑清理连带删除；字段兼容、HTML 受控展示、图表数据与定位精度留待适配。
- **现有领域与服务端**：`lib/types/stage.ts`、`lib/types/scene.ts`、`lib/types/outline.ts`、`lib/types/action.ts`，以及 `app/api/quiz-grade/route.ts`、现有查询、校验、模型封装和 Prisma schema。不覆盖现有类型以迎合源项目；旧批改 Route 的适配留在阶段三，本阶段不再由 QuizView 调用。
- **既有业务与参考**：首页和生成页、`lib/hooks/use-draft-cache.ts`、`reference/`、OpenMAIC 来源目录保持原样。已有图片／图案显示不按媒体生成能力删除；本阶段不补缺失图片组件或引入媒体恢复体系。

## 实施顺序

- [ ] **C1 — 先解除外围调用，再删除专属文件。** 从课堂页、Stage、页头、目录和画布收掉编辑、白板、媒体、语音、缩略图、真实聊天和后台生成入口，再删除上列 9 个文件。Roundtable 混有字幕和控制职责：去掉真实讨论耦合时，保留对应数据、回调和现有播放外壳中的承接位置，不因模块缺失把这些职责一并删除。映射：CP-1～5、CP-11、CP-12 及非目标。

- [ ] **C2 — 收窄共享状态，断开旧权威存储。** 删除入口及 stage store 对 load/saveStageData、Dexie 和防抖自动保存的调用；setOutlines 不再写浏览器数据库。保留接收已保存场景和目录的页面状态更新，移除场景编辑、重排及生成调度方法；去掉 pending 下自动切入新场景的分支。SceneProvider 保留只读订阅，不保留编辑 controller 和内容写回；canvas store 保留视口与教学效果，解除 ProseMirror、编辑、白板和视频状态。旧存储文件暂留且不被当前播放链动态导入。映射：CP-1、CP-2、CP-4、CP-5、CP-8、CP-10、CP-12、CP-13。

- [ ] **C3 — 保留播放核心，解除音频和真实对话。** 同步调整 PlaybackEngine、ActionEngine 与调用方的构造和回调，移除音频播放器、浏览器 TTS、原 settings、白板／视频动作及其专属类型。speech 保留已有阅读计时源码，不再经过音频失败后才进入计时；保留顺序、暂停／继续和清理结构，本阶段不重写计时节奏或补下一段／重播状态机。讨论动作保留 topic、prompt 和等待继续的承接边界，不删除或默认跳过；三类 widget 动作保留，解除 iframe 绑定后如实暴露尚未接入，不假装执行成功。移除场末自动翻页分支，末页与就绪门禁的完整行为留到联调。映射：CP-3～5、CP-10～12。

- [ ] **C4 — 收窄展示与测验调用链。** 展示入口只保留 slide/quiz，去掉 autonomous Canvas；ScreenElement 退出视频、代码块、表格分发，不导入缺失视频／图片模块来凑通；无法展示的内容不能静默消失，已有图片的完整展示处理仍待后续。改用已有视口 hook 和具体 store 路径，保留元素层次与效果覆盖层。QuizView 解除 localStorage 提交／恢复、对象草稿 hook、客户端正式评分、旧简答 API 和“失败给半分”流程，保留三类输入及反馈组件；后端接通前提交明确不可用，不产生本地正式成绩。比较算法保留给后端复用，题型判断改用本项目显式类型。映射：CP-2、CP-4、CP-6～11、CP-13。

- [ ] **C5 — 核对保留链和剩余缺口。** 对保留消费者修正既有 Scene、SceneContent、QuizQuestion、SceneOutline 等类型的引用；去掉仅服务已排除模式的类型，不导入整套原项目 stage/chat/generation 类型或新建缺失 store 大入口。核对创建课堂、生成预览和现有草稿 hook 未受影响。分类记录剩余依赖与契约问题，区分原有问题、解除依赖后暴露的原有差距和本次清理引入的问题。映射：CP-1～13 的后续适配基础。

## 完成检查

以下为阶段二的结构检查，不等于 CP 的运行验收。

- [ ] **删除范围准确。** 仅删除上述 9 个文件；没有遗留对它们的导入或 re-export，没有连带删除 Base、样式 hooks、SVG defs 或必要状态；代码块、表格和旧存储源码仍在。
- [ ] **排除依赖退出。** 从课堂入口、播放外壳、引擎、画布和测验追踪，确认不再调用原项目编辑、白板、音视频、真实聊天、媒体生成及后台生成体系；旧数据库和 quiz persistence 不再被实际播放路径消费。保留源码中的旧引用与当前主链引用分开说明。
- [ ] **必需职责有承接。** 幻灯片展示、讲稿字幕、播放控制、七类 Action、目录就绪状态和三类测验的结构仍可定位；讨论提示与真实聊天、场景消费与后台生成已分开。读取／保存／批改缺口没有被假成功遮蔽。
- [ ] **静态检查可解释。** 对修改的实现文件做定向 ESLint；用当前 tsconfig 做不发射产物的 TypeScript 检查，关闭 incremental 以免写 tsbuildinfo。清理引入的断链和类型错误须修复；保留候选源码、未改后端及尚待适配的原有问题逐项归类。不以报错数量下降或归零作为功能完成证据，不用 ts-ignore、any 兜底或排除类型检查掩盖保留链路问题。
- [ ] **交付范围可复核。** 审阅实际 diff，在本 task 回填完成项、静态检查结果及剩余缺口。说明阶段三还需真实读取／保存／判分／恢复，阶段四／五还需静态状态和行为验收；不宣称播放、保存、批改或整条产品链已完成。

本阶段不运行 `pnpm build`，不新增测试文件，不自行启动服务、调用模型、执行数据库迁移、提交或推送。若检查发现与 spec／ADR 冲突的新需求，先说明影响并对齐，不自行扩大清理范围。

## 交付记录

2026-10-21：依据已对齐的阶段二范围编写本 task，等待文档审阅；未执行上述代码修改、文件删除或功能验证。源码盘点中的诊断数量是历史检查结果，实施时以当次基线重新记录。
