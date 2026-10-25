题目：{{questions}}
标题：{{title}}
要点：{{keyPoints}}
描述：{{description}}
{{courseContext}}

{{#if languageDirective}}
**语言要求**：{{languageDirective}}
{{/if}}

至少包含非空讲稿；不使用 spotlight / laser。组件高亮 / 标注的 target 必须来自上面的题目 ID，state 必须是非空 JSON 对象。不生成 discussion 动作。保持动作与讲稿的交错顺序，params 不得包含 id 或 type。

直接输出 JSON 数组（不要解释、不要代码围栏，共 3–6 个片段）：
[{"type":"text","content":"让我们检验一下你对所学内容的理解"}]
