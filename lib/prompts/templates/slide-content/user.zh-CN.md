# 生成要求

{{#if inputContext}}
## 课程与参考上下文

{{inputContext}}
{{/if}}

## 场景信息

- **标题**：{{title}}
- **描述**：{{description}}
- **要点**：
  {{keyPoints}}

{{teacherContext}}

## 可用资源

- **画布尺寸**：{{canvas_width}} × {{canvas_height}} px
- 本次未提供图片或视频来源。使用文本、形状、线条、图表与公式表达，不生成图片或视频元素，不编造 URL 或生成占位符。

## 输出要求

根据以上场景信息，为单页生成完整的 Canvas/PPT 组件。

{{#if languageDirective}}
## 语言要求
{{languageDirective}}
{{/if}}

**必须遵守**：

1. 直接输出纯 JSON，不要附加解释或说明。
2. 不要使用 ```json 代码围栏包裹输出。
3. JSON 前后都不要添加其他文本。
4. 确保 JSON 格式正确，可直接解析。
5. 所有元素的 `left`、`top`、`width`、`height` 都必须是 JSON 数字，不能省略，也不能写成字符串。TextElement 的 `height` 必须从 system 提示词中的速查表选择。LineElement 同样必须带 `height`。

**输出结构示例**：
{"background":{"type":"solid","color":"#ffffff"},"elements":[{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":76,"content":"<p style=\"font-size:32px;\"><strong>标题内容</strong></p>","defaultFontName":"","defaultColor":"#333333"},{"id":"content_001","type":"text","left":60,"top":150,"width":880,"height":130,"content":"<p style=\"font-size:18px;\">• 要点一</p><p style=\"font-size:18px;\">• 要点二</p><p style=\"font-size:18px;\">• 要点三</p>","defaultFontName":"","defaultColor":"#333333"}]}
