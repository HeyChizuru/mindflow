---
feature_id: 课堂播放与测验
artifact: tasks
implements: [CP-1, CP-2, CP-3, CP-4, CP-5, CP-6, CP-7, CP-8, CP-9, CP-10, CP-11, CP-12, CP-13]
governed_by: [intent, adr-001, adr-002, adr-003, adr-004, adr-005]
---

# 阶段二：范围清理

依据 [spec](./spec.md)、[plan 阶段二](./plan.md#阶段二范围清理) 和 [源码盘点](./源码盘点.md)，按已对齐的范围收窄调用链，留下后续可适配的课堂播放与测验骨架。前序交付记录已记载 C1、C2 实施；本轮完成 C3～C5 的结构清理。spec 仍标为 draft，本文件不改变功能承诺或表示实现已获验收。

## 目标与实施边界

清理明确非目标能力，解除真实讨论、后台续生成与旧浏览器权威存储的运行耦合；保留幻灯片展示、字幕、播放控制、教学动作、三类题目和反馈展示的结构。

- 本轮 C3～C5 起点为 `67fae10dc431098664830aeaccd86ae9b28c37b9`，已包含前序 C1、C2 提交。盘点的 `cdbf5f0` 是历史快照；草稿 hook 的 `copy` 副本和 C1 的 9 个文件已经移除，不再作为本轮待删除文件。
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

- [x] **C2 — 收窄共享状态，断开旧权威存储。** 删除入口及 stage store 对 load/saveStageData、Dexie 和防抖自动保存的调用；setOutlines 不再写浏览器数据库。保留接收已保存场景和目录的页面状态更新，移除场景编辑、重排及生成调度方法；去掉 pending 下自动切入新场景的分支。SceneProvider 保留只读订阅，不保留编辑 controller 和内容写回；canvas store 保留视口与教学效果，解除 ProseMirror、编辑、白板和视频状态。因 ActionEngine 仍读取白板／视频状态并调用对应方法，C2 同步移除这两类动作分支，避免 store 收窄后留下运行时引用。若服务端完整课堂读取仍未接通，页面须明确展示读取失败并保留重试，不得以空课堂作为读取成功。旧存储文件暂留且不被当前播放链动态导入。映射：CP-1、CP-2、CP-4、CP-5、CP-8、CP-10、CP-12、CP-13。

- [x] **C3 — 保留播放核心，解除音频和真实对话。** 同步调整 PlaybackEngine、ActionEngine 与调用方的构造和回调，移除音频播放器、浏览器 TTS、原 settings 及其专属类型；白板／视频动作分支已在 C2 随共享状态一并解除。speech 保留已有阅读计时源码，不再经过音频失败后才进入计时；保留顺序、暂停／继续和清理结构，本阶段不重写计时节奏或补下一段／重播状态机。讨论动作保留 topic、prompt 和等待继续的承接边界，不删除或默认跳过；三类 widget 动作保留，解除 iframe 绑定后如实暴露尚未接入，不假装执行成功。移除场末自动翻页分支，末页与就绪门禁的完整行为留到联调。映射：CP-3～5、CP-10～12。

- [x] **C4 — 收窄展示与测验调用链。** 展示入口只保留 slide/quiz，去掉 autonomous Canvas；ScreenElement 退出视频、代码块、表格分发，不导入缺失视频／图片模块来凑通。暂不支持完整渲染的已保存图片元素须显示清楚可见的占位提示，且不遮挡同页其他元素；完整图片资源恢复与渲染留待后续阶段。其他无法展示的内容也不能静默消失。改用已有视口 hook 和具体 store 路径，保留元素层次与效果覆盖层。QuizView 解除 localStorage 提交／恢复、对象草稿 hook、客户端正式评分、旧简答 API 和“失败给半分”流程，保留三类输入及反馈组件；后端接通前提交明确不可用，不产生本地正式成绩。比较算法保留给后端复用，题型判断改用本项目显式类型。映射：CP-2、CP-4、CP-6～11、CP-13。

- [x] **C5 — 核对保留链和剩余缺口。** 对保留消费者修正既有 Scene、SceneContent、QuizQuestion、SceneOutline 等类型的引用；去掉仅服务已排除模式的类型，不导入整套原项目 stage/chat/generation 类型或新建缺失 store 大入口。核对创建课堂、生成预览和现有草稿 hook 未受影响。分类记录剩余依赖与契约问题，区分原有问题、解除依赖后暴露的原有差距和本次清理引入的问题。映射：CP-1～13 的后续适配基础。

## 完成检查

以下为阶段二的结构检查，不等于 CP 的运行验收。

- [x] **删除范围准确。** 仅删除上述 9 个文件；没有遗留对它们的导入或 re-export，没有连带删除 Base、样式 hooks、SVG defs 或必要状态；代码块、表格和旧存储源码仍在。
- [x] **排除依赖退出。** 从课堂入口、播放外壳、引擎、画布和测验追踪，确认不再调用原项目编辑、白板、音视频、真实聊天、媒体生成及后台生成体系；旧数据库和 quiz persistence 不再被实际播放路径消费。保留源码中的旧引用与当前主链引用分开说明。
- [x] **必需职责有承接。** 幻灯片展示、讲稿字幕、播放控制、七类 Action、目录就绪状态和三类测验的结构仍可定位；讨论提示与真实聊天、场景消费与后台生成已分开。暂不支持完整渲染的图片有可见占位提示，且不遮挡同页其他元素。读取／保存／批改缺口没有被假成功遮蔽。
- [x] **静态检查可解释。** 对修改的实现文件做定向 ESLint；用当前 tsconfig 做不发射产物的 TypeScript 检查，关闭 incremental 以免写 tsbuildinfo。清理引入的断链和类型错误须修复；保留候选源码、未改后端及尚待适配的原有问题逐项归类。不以报错数量下降或归零作为功能完成证据，不用 ts-ignore、any 兜底或排除类型检查掩盖保留链路问题。
- [x] **交付范围可复核。** 审阅实际 diff，在本 task 回填完成项、静态检查结果及剩余缺口。说明阶段三还需真实读取／保存／判分／恢复，阶段四／五还需静态状态和行为验收；不宣称播放、保存、批改或整条产品链已完成。

本阶段不运行 `pnpm build`，不新增测试文件，不自行启动服务、调用模型、执行数据库迁移、提交或推送。若检查发现与 spec／ADR 冲突的新需求，先说明影响并对齐，不自行扩大清理范围。

## 交付记录

2026-10-21：用户要求完善 task 并实施 C1，确认不要求整仓编译通过。已将实际基线更新为 `fe2deb1845e35ca27e36a06c271388218895873e`，明确 C4 对暂不支持图片渲染的占位提示边界。C1 已完成：移除课堂播放外围的编辑、生成、媒体恢复、白板、缩略图和真实聊天入口，保留 slide/quiz 展示、目录/就绪状态、字幕与播放控制；按范围删除 9 个专属文件。记录 C1 交付时，C2～C5 尚未开始。

- 定向 ESLint：通过，0 error；`scene-sidebar.tsx` 的 `<img>` 告警在基线文件中已存在。
- `git diff --check`：通过。
- `tsc --noEmit --incremental false`：退出码 2，共 159 条诊断；本轮改动文件中唯一命中为 `PlaybackChromeRoot.tsx` 对 `@/lib/utils/audio-player` 的缺失模块引用，该导入在基线版本中已存在。按用户要求不为整仓编译通过扩展到 C2～C5。
- 删除路径引用检查：未发现对被删包装组件、编辑锁或媒体 Stage context 的运行时代码导入；保留的 Base 展示组件及元素类型/提示词命中属于预期引用。

2026-10-21：用户确认按已调整的边界实施 C2。已收窄 `stage` store 为课堂、场景、目录和当前位置的内存状态，移除 Dexie、旧 stage-storage、防抖保存、编辑/重排及生成调度方法；`setOutlines` 只更新内存。课堂入口改为读取完整课堂接口并校验响应和场景，读取失败或场景为空时显示错误与重试；当前仓库尚无 `/api/classroom`，因此完整读取仍待阶段三接通。SceneProvider 改为只读订阅；canvas store 只保留视口与教学效果；ActionEngine/PlaybackEngine 移除白板和视频动作及状态调用。旧存储文件保留且退出当前播放调用链。记录 C2 交付时，C3～C5 尚未开始。

- 定向 ESLint：通过，7 个修改的实现文件无诊断。
- `git diff --check`：通过。
- 静态引用检查：当前播放代码未再引用 stage-storage/Dexie、canvas 白板/视频状态或 ActionEngine 的白板/视频分支；旧存储文件和提示词中的历史内容保留。
- TypeScript 检查、测试和 build：未运行；按用户要求不以编译通过作为本轮条件。

### 2026-10-22：C3～C5

- **C3**：收窄 `lib/playback/{engine,types,derived-state}.ts`、`lib/action/engine.ts` 和 `PlaybackChromeRoot.tsx`。引擎只消费当前场景，speech 直接沿用原阅读估时（中日韩文字 150ms/字，其他文字 240ms/词，最少 2 秒）；暂停保存剩余时间，停止清理计时器与效果。discussion 保留话题、引导和等待继续，暂停期间不丢失待显示的提示；三类 widget 返回不可用结果并在外壳显示提示，完整动作仍交给回调。移除音频、TTS、live/Agent、浏览器快照及 iframe 通道依赖。
- **C4**：`ScreenElement` 保留五类 Base 展示；图片、视频、未知元素及暂不兼容的形状／线条／图表有可见提示，提示只占元素原边界并保持透明。`ScreenCanvas` 使用原有视口 hook 与具体 canvas store，覆盖层改用本项目场景类型；hook 沿用比例缩放并移除编辑拖拽状态。`QuizView` 保留单选、多选、简答和逐题反馈组件，输入仅存组件内存，提交禁用并说明不保存、不生成成绩；解除旧保存、正式本地判分、旧 API、半分兜底和语音输入。`grading.ts` 保留纯比较并用显式题型，浏览器只引用结果类型；`element.ts` 移除无消费者的复制／对齐工具，保留线条、几何和表格配色。补齐最少测验提示文案。
- **C5**：保留消费者使用既有 `Scene`、`SceneContent`、`QuizQuestion`、`SceneOutline`，没有覆盖领域类型或补原项目类型／store 大入口。从课堂页递归检查静态导入、re-export 和字面量动态导入：48 个本地运行时文件，无缺失本地模块，未进入已排除的编辑、音视频、聊天、旧存储、代码块或表格候选。9 个 C1 删除路径仍不存在，约定保留文件仍在；C1 任务行与本轮起点完全一致。

检查结果：

- 定向 ESLint：本轮 15 个实现文件通过，无诊断。`git diff --check`：通过。
- `tsc --noEmit --incremental false --pretty false`：退出码 2，剩余 50 条诊断；仅作为问题盘点，不要求整仓编译通过。本轮测验显式题型接线产生的一处收窄错误已修复；修改文件中只剩 `element.ts` 原有的 `tinycolor2` 缺失导入，没有新增忽略规则或检查排除项。
- **原有、仍在播放展示链的依赖缺口（10 条）**：`Chart.tsx` 7 条、`chartOption.ts` 2 条（缺 ECharts、tinycolor2 及关联类型）；`element.ts` 1 条（缺 tinycolor2，线条展示仍会加载此工具）。这些会阻碍当前打包／运行，未安装依赖或伪造替代模块。
- **原有、已退出当前播放链的源码（37 条）**：代码块候选 `BaseCodeElement.tsx` 缺 shiki 1 条；旧存储 `database.ts` 24 条、`stage-storage.ts` 12 条，涉及 Dexie、原项目类型与聊天／快照模块。按约定保留，未通过删除或排除源码掩盖诊断。
- **未改服务端的原有契约问题（3 条）**：`app/api/quiz-grade/route.ts` 缺 `api-response`、`resolve-model`，且模型调用参数不匹配。当前测验不再调用该 Route，适配留阶段三。
- Diff 仅涉及上述播放、动作、展示、测验、canvas 状态、共享工具、最少文案和本 task；首页、生成页、既有草稿 hook、reference、API、数据库、领域类型、spec／ADR／AGENTS.md 均无改动。本轮不新增或删除文件，未运行测试、build、服务、模型或数据库命令，未提交或推送。

清理后显露但尚未完成的契约：阶段三接通完整课堂读取、位置和逐题保存、服务端判分与恢复；阶段四／五处理页面内切场保留未提交输入、自动开播、下一段与独立重播入口、目录就绪／末页门禁、内容更新不打断播放及旧回调隔离。三类 widget 的实际落点、暂停期间效果保留、图表数据／形状字段适配、图片完整渲染、HTML 受控展示、公式样式、比例与效果定位精度、全屏字幕／讨论提示布局亦待后续适配与运行验收。本轮只交付阶段二结构，不视为 CP-1～13 完成。
