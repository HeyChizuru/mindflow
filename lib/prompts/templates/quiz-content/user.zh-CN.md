{{#if inputContext}}
## 课程与参考上下文

{{inputContext}}
{{/if}}

## 本次测验

标题：{{title}}
描述：{{description}}
测试要点：{{keyPoints}}
题目数量：{{questionCount}}，难度：{{difficulty}}，允许题型：{{questionTypes}}
严格生成指定数量，所有题目必须属于允许题型。每道题都要有非空且不重复的 id、题干、analysis 和正数 points；简答题另须非空 commentPrompt。

{{#if languageDirective}}
## 语言要求
{{languageDirective}}
{{/if}}

## 输出格式

直接输出 JSON 数组，不要解释、代码围栏或 LaTeX。以下是各题型的结构示例，只按本次允许题型及数量选用：

单选题：
[{"id":"q1","type":"single","question":"题目内容","options":[{"value":"A","label":"选项 A"},{"value":"B","label":"选项 B"}],"answer":["A"],"analysis":"A 正确的理由","points":10}]

多选题：
[{"id":"q2","type":"multiple","question":"选择所有正确项","options":[{"value":"A","label":"选项 A"},{"value":"B","label":"选项 B"},{"value":"C","label":"选项 C"}],"answer":["A","C"],"analysis":"A 和 C 正确的理由","points":15}]

简答题：
[{"id":"q3","type":"short_answer","question":"解释本节核心概念","analysis":"参考解析应涵盖的要点","commentPrompt":"根据概念准确性与解释完整性分别评分","points":20}]
