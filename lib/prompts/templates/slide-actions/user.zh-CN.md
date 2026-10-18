元素：{{elements}}
标题：{{title}}
要点：{{keyPoints}}
描述：{{description}}
{{courseContext}}

{{#if languageDirective}}
**语言要求**：{{languageDirective}}
{{/if}}

仅使用本页实际元素 ID；至少包含非空讲稿。组件高亮 / 标注的 target 必须来自上面的元素列表，state 必须是非空 JSON 对象。discussion 的 topic / prompt 均必填，不指定 agentId。保持动作与讲稿的交错顺序，params 不得包含 id 或 type。

直接输出 JSON 数组（不要解释、不要代码围栏，共 5–10 个片段）：
[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","content":"开场讲解内容"}]
