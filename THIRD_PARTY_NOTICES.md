# 第三方来源与许可证声明

本声明对应当前源码版本；项目根目录的 MIT 许可证不改变第三方软件、字体或历史版本各自适用的条款。

## OpenMAIC

- 项目：[THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)。
- 许可依据：[v0.3.0](https://github.com/THU-MAIC/OpenMAIC/releases/tag/v0.3.0)，固定提交 `da0b394b81745153b0dffd8537d0b2d1b94eaf61`。该版本宣布从 AGPL-3.0 改为 MIT，其 [LICENSE](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/LICENSE) 与版权声明全文保存在 [third_party/OpenMAIC.LICENSE](./third_party/OpenMAIC.LICENSE)。
- 版权：Copyright (c) 2026 THU-MAIC。
- 本项目复用并修改了提示词系统、部分生成和解析工具、幻灯片渲染器、画布与教学覆盖层、播放 / 动作引擎、界面组件、状态和数据类型，以及相关样式。
- 适配包含中文提示词、类型与接口调整、功能裁剪、服务端数据保存、状态恢复和 MindFlow 页面接线。对应路径表示来源关系，不表示文件仍与上游完全相同。

### 当前保留的引入文件

以下对应取自本项目的提示词、生成和播放引入记录；模板的 `.zh-CN.md` 为中文化 / 修改版本，其上游对应英语模板。viewport hook 迁入时从上游 Editor/Canvas/hooks 路径调整到本地路径，之后改为只读画布尺寸计算。slides 类型的上游路径已迁到 DSL 包。

- `app/api/generate/scene-actions/route.ts` → [app/api/generate/scene-actions/route.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/app/api/generate/scene-actions/route.ts)
- `app/api/generate/scene-content/route.ts` → [app/api/generate/scene-content/route.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/app/api/generate/scene-content/route.ts)
- `app/api/quiz-grade/route.ts` → [app/api/quiz-grade/route.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/app/api/quiz-grade/route.ts)
- `app/classroom/[id]/page.tsx` → [app/classroom/[id]/page.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/app/classroom/[id]/page.tsx)
- `components/canvas/canvas-area.tsx` → [components/canvas/canvas-area.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/canvas/canvas-area.tsx)
- `components/canvas/canvas-toolbar.tsx` → [components/canvas/canvas-toolbar.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/canvas/canvas-toolbar.tsx)
- `components/edit/PlaybackChromeRoot.tsx` → [components/edit/PlaybackChromeRoot.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/edit/PlaybackChromeRoot.tsx)
- `components/header.tsx` → [components/header.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/header.tsx)
- `components/scene-renderers/quiz-view.tsx` → [components/scene-renderers/quiz-view.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/scene-renderers/quiz-view.tsx)
- `components/slide-renderer/components/element/ChartElement/BaseChartElement.tsx` → [components/slide-renderer/components/element/ChartElement/BaseChartElement.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/ChartElement/BaseChartElement.tsx)
- `components/slide-renderer/components/element/ChartElement/Chart.tsx` → [components/slide-renderer/components/element/ChartElement/Chart.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/ChartElement/Chart.tsx)
- `components/slide-renderer/components/element/ChartElement/chartOption.ts` → [components/slide-renderer/components/element/ChartElement/chartOption.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/ChartElement/chartOption.ts)
- `components/slide-renderer/components/element/ElementOutline.tsx` → [components/slide-renderer/components/element/ElementOutline.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/ElementOutline.tsx)
- `components/slide-renderer/components/element/hooks/useElementFill.ts` → [components/slide-renderer/components/element/hooks/useElementFill.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/hooks/useElementFill.ts)
- `components/slide-renderer/components/element/hooks/useElementFlip.ts` → [components/slide-renderer/components/element/hooks/useElementFlip.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/hooks/useElementFlip.ts)
- `components/slide-renderer/components/element/hooks/useElementOutline.ts` → [components/slide-renderer/components/element/hooks/useElementOutline.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/hooks/useElementOutline.ts)
- `components/slide-renderer/components/element/hooks/useElementShadow.ts` → [components/slide-renderer/components/element/hooks/useElementShadow.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/hooks/useElementShadow.ts)
- `components/slide-renderer/components/element/LatexElement/BaseLatexElement.tsx` → [components/slide-renderer/components/element/LatexElement/BaseLatexElement.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/LatexElement/BaseLatexElement.tsx)
- `components/slide-renderer/components/element/LineElement/BaseLineElement.tsx` → [components/slide-renderer/components/element/LineElement/BaseLineElement.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/LineElement/BaseLineElement.tsx)
- `components/slide-renderer/components/element/LineElement/LinePointMarker.tsx` → [components/slide-renderer/components/element/LineElement/LinePointMarker.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/LineElement/LinePointMarker.tsx)
- `components/slide-renderer/components/element/ShapeElement/BaseShapeElement.tsx` → [components/slide-renderer/components/element/ShapeElement/BaseShapeElement.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/ShapeElement/BaseShapeElement.tsx)
- `components/slide-renderer/components/element/ShapeElement/GradientDefs.tsx` → [components/slide-renderer/components/element/ShapeElement/GradientDefs.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/ShapeElement/GradientDefs.tsx)
- `components/slide-renderer/components/element/ShapeElement/PatternDefs.tsx` → [components/slide-renderer/components/element/ShapeElement/PatternDefs.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/ShapeElement/PatternDefs.tsx)
- `components/slide-renderer/components/element/TextElement/BaseTextElement.tsx` → [components/slide-renderer/components/element/TextElement/BaseTextElement.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/components/element/TextElement/BaseTextElement.tsx)
- `components/slide-renderer/Editor/HighlightOverlay.tsx` → [components/slide-renderer/Editor/HighlightOverlay.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/Editor/HighlightOverlay.tsx)
- `components/slide-renderer/Editor/LaserOverlay.tsx` → [components/slide-renderer/Editor/LaserOverlay.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/Editor/LaserOverlay.tsx)
- `components/slide-renderer/Editor/ScreenCanvas.tsx` → [components/slide-renderer/Editor/ScreenCanvas.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/Editor/ScreenCanvas.tsx)
- `components/slide-renderer/Editor/ScreenElement.tsx` → [components/slide-renderer/Editor/ScreenElement.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/Editor/ScreenElement.tsx)
- `components/slide-renderer/Editor/SpotlightOverlay.tsx` → [components/slide-renderer/Editor/SpotlightOverlay.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/Editor/SpotlightOverlay.tsx)
- `components/slide-renderer/hooks/useViewportSize.ts` → [components/slide-renderer/Editor/Canvas/hooks/useViewportSize.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/slide-renderer/Editor/Canvas/hooks/useViewportSize.ts)
- `components/stage.tsx` → [components/stage.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/stage.tsx)
- `components/stage/scene-renderer.tsx` → [components/stage/scene-renderer.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/stage/scene-renderer.tsx)
- `components/stage/scene-sidebar.tsx` → [components/stage/scene-sidebar.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/components/stage/scene-sidebar.tsx)
- `lib/action/engine.ts` → [lib/action/engine.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/action/engine.ts)
- `lib/contexts/scene-context.tsx` → [lib/contexts/scene-context.tsx](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/contexts/scene-context.tsx)
- `lib/generation/action-parser.ts` → [lib/generation/action-parser.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/generation/action-parser.ts)
- `lib/generation/json-repair.ts` → [lib/generation/json-repair.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/generation/json-repair.ts)
- `lib/generation/pipeline-types.ts` → [lib/generation/pipeline-types.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/generation/pipeline-types.ts)
- `lib/generation/prompt-formatters.ts` → [lib/generation/prompt-formatters.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/generation/prompt-formatters.ts)
- `lib/generation/scene-generator.ts` → [lib/generation/scene-generator.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/generation/scene-generator.ts)
- `lib/hooks/use-slide-background-style.ts` → [lib/hooks/use-slide-background-style.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/hooks/use-slide-background-style.ts)
- `lib/playback/derived-state.ts` → [lib/playback/derived-state.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/playback/derived-state.ts)
- `lib/playback/engine.ts` → [lib/playback/engine.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/playback/engine.ts)
- `lib/playback/index.ts` → [lib/playback/index.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/playback/index.ts)
- `lib/playback/types.ts` → [lib/playback/types.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/playback/types.ts)
- `lib/prompts/index.ts` → [lib/prompts/index.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/index.ts)
- `lib/prompts/loader.ts` → [lib/prompts/loader.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/loader.ts)
- `lib/prompts/README.md` → [lib/prompts/README.md](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/README.md)
- `lib/prompts/snippets/json-output-rules.md` → [lib/prompts/snippets/json-output-rules.md](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/snippets/json-output-rules.md)
- `lib/prompts/templates/requirements-to-outlines/system.zh-CN.md` → [lib/prompts/templates/requirements-to-outlines/system.md](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/requirements-to-outlines/system.md)
- `lib/prompts/templates/requirements-to-outlines/user.zh-CN.md` → [lib/prompts/templates/requirements-to-outlines/user.md](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/requirements-to-outlines/user.md)
- `lib/prompts/templates/slide-actions/system.zh-CN.md` → [lib/prompts/templates/slide-actions/system.md](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/slide-actions/system.md)
- `lib/prompts/templates/slide-content/system.zh-CN.md` → [lib/prompts/templates/slide-content/system.md](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/slide-content/system.md)
- `lib/prompts/types.ts` → [lib/prompts/types.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/types.ts)
- `lib/quiz/grading.ts` → [lib/quiz/grading.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/quiz/grading.ts)
- `lib/store/canvas.ts` → [lib/store/canvas.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/store/canvas.ts)
- `lib/store/stage.ts` → [lib/store/stage.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/store/stage.ts)
- `lib/types/action.ts` → [lib/types/action.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/types/action.ts)
- `lib/types/slides.ts` → [packages/@openmaic/dsl/src/slides.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/packages/@openmaic/dsl/src/slides.ts)
- `lib/utils/create-selectors.ts` → [lib/utils/create-selectors.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/utils/create-selectors.ts)
- `lib/utils/element.ts` → [lib/utils/element.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/utils/element.ts)

### 其他适配与抽取

- 首页创建相关的 `components/generation/generation-toolbar.tsx`、`lib/hooks/use-draft-cache.ts`、`lib/store/user-profile.ts`，以及 `lib/logger.ts` 的原有工具结构，参考同一版本中的对应路径，并按 MindFlow 的 PDF 上传、草稿和模型调用边界适配。
- `app/globals.css` 中课堂播放、渲染相关样式，参考同一版本的 [app/globals.css](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/app/globals.css)，结合本项目的 Tailwind / shadcn 主题改造。
- `lib/types/outline.ts`、`lib/types/scene.ts`、`lib/types/stage.ts` 中课程、大纲、场景、幻灯片、测验及动作的相关契约，适配上游 [lib/types/stage.ts](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/types/stage.ts) 和 [DSL slides](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/packages/@openmaic/dsl/src/slides.ts)。
- `lib/prompts/build-outline-generation-prompt.ts` 与大纲生成 API 的提示词接线，参考上游 [流式大纲 API](https://github.com/THU-MAIC/OpenMAIC/blob/da0b394b81745153b0dffd8537d0b2d1b94eaf61/app/api/generate/scene-outlines-stream/route.ts)。
- 当前 quiz 内容 / 动作模板与 slide / quiz 用户模板中保留的结构，参考同一版本的 [quiz-content](https://github.com/THU-MAIC/OpenMAIC/tree/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/quiz-content)、[quiz-actions](https://github.com/THU-MAIC/OpenMAIC/tree/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/quiz-actions)、[slide-content](https://github.com/THU-MAIC/OpenMAIC/tree/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/slide-content) 和 [slide-actions](https://github.com/THU-MAIC/OpenMAIC/tree/da0b394b81745153b0dffd8537d0b2d1b94eaf61/lib/prompts/templates/slide-actions)。

### 历史来源

早期迁入使用了一个根许可证为 AGPL v3 的本地快照，其本地提交号为 `e67b2be81396d4012f0eb244819dff22ae5a3214`。这个提交号不是已验证的官方上游提交，不能将其当作官方版本链接。

当前保留内容的授权核对以官方 MIT 版本为依据，包含对原样内容、改动部分与模板来源的比对。历史已删除的流水线、互动分支及其他文件不因当前版本采用 MIT 而被追溯重新许可；历史快照中的 AGPL 许可全文另附于 [third_party/HISTORICAL-AGPL-3.0.txt](./third_party/HISTORICAL-AGPL-3.0.txt)，供核对历史内容时使用。

## shadcn/ui

`components/ui/` 中的生成 / 适配组件以及相关主题基于 [shadcn/ui](https://github.com/shadcn-ui/ui)。其 MIT 版权声明与全文保存在 [third_party/shadcn-ui.LICENSE](./third_party/shadcn-ui.LICENSE)。

这些组件的进一步依赖（例如 Radix）保留各自许可。

## 字体、图标与直接依赖

- Inter：`@fontsource-variable/inter`，SIL Open Font License 1.1。
- Geist Sans / Mono：`geist`，SIL Open Font License 1.1。
- Lucide 图标：`lucide-react`，ISC，包内声明还包含部分来自 Feather 的 MIT 图标；完整声明一并保留。
- KaTeX 的 CSS / 数学字体、ECharts 图表及其他包的附带声明，保留其发布包中的 LICENSE / NOTICE 内容。
- DOMPurify 的包声明为 `MPL-2.0 OR Apache-2.0`；该可选授权不被项目的 MIT 覆盖。

[third_party/DEPENDENCY_LICENSES.txt](./third_party/DEPENDENCY_LICENSES.txt) 汇集当前锁定并安装的 48 个直接运行 / 开发依赖的版本、许可声明与包内许可文本，包括 ECharts NOTICE 和字体条款。它不是所有传递依赖或任意构建产物的完整许可清单；分发打包后的应用时还需保留实际分发依赖的声明。

## 数据与外部服务

用户上传的 PDF、模型提供商服务与生成结果不因源码仓库采用 MIT 而自动获得本项目的版权授权。上传资料应有相应使用权限，外部服务适用其服务条款。
