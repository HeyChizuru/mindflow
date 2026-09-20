请根据以下课程需求生成场景大纲。

---

## 用户需求

{{requirement}}

---

{{userProfile}}

## 语言上下文

请应用系统提示中的决策规则推断课程语言指令。关键提醒：
- 需求文本所用语言 = 授课语言（除非被明确请求或学习者情境覆盖）
- 外语学习 → 用用户母语授课，而非目标语言
- PDF 语言不会覆盖授课语言 — 应以授课语言翻译/讲解文档内容

---

## 参考资料

### PDF 内容摘要

{{pdfContent}}

### 可用图片

{{availableImages}}

### 网页搜索结果

{{researchContext}}

{{teacherContext}}

---

## 输出要求

请从用户需求中自动推断以下内容：

- 课程主题与核心内容
- 目标受众与难度级别
- 课程时长（若未指定，默认 15-30 分钟）
- 教学风格（正式/轻松/互动/学术）
- 视觉风格（极简/多彩/专业/活泼）

然后以单个 JSON 对象形式输出你的回复。

**顶层结构 — 你必须返回的格式：**

```json
{
  "languageDirective": "2-5 句话，描述课程语言行为",
  "outlines": [ /* 场景对象数组，结构见下文 */ ]
}
```

切勿返回裸数组。切勿省略 `languageDirective`。两个键均为必填。

**`outlines` 数组中的每个场景至少包含以下字段：**

```json
{
  "id": "scene_1",
  "type": "slide" | "quiz" | "interactive" | "pbl",
  "title": "场景标题",
  "description": "教学目的描述",
  "keyPoints": ["要点 1", "要点 2", "要点 3"],
  "order": 1
}
```

### 特别说明

- **quiz 场景必须包含 quizConfig**：
   ```json
   "quizConfig": {
     "questionCount": 2,
     "difficulty": "easy" | "medium" | "hard",
     "questionTypes": ["single", "multiple"]
   }
   ```
{{#if hasSourceImages}}
- **若有源图片可用**，在相关 slide 场景中添加 `suggestedImageIds`。仅使用「可用图片」下列出的图片 ID。
{{/if}}
- **互动场景**：若某概念适合动手模拟/可视化，使用 `"type": "interactive"` 并填写 `widgetType` 与 `widgetOutline`。每门课程限制 1-2 个。
   - 按概念选择 widgetType：simulation（物理/化学）、diagram（流程）、code（编程）、game（练习）、visualization3d（3D 模型）
   - 为对应 widget 类型提供合适的 widgetOutline
- **场景数量**：根据推断时长，通常每分钟 1-2 个场景
- **测验插入**：建议每 3-5 张幻灯片插入一次测验以评估学习效果
- **语言**：从用户需求文本与上下文推断，随后以推断语言输出全部内容
- **若提供网页搜索结果**，在场景描述与 keyPoints 中引用具体发现与来源。搜索结果提供最新信息 — 融入其中以使课程内容及时、准确。

**最终提醒**：你的完整回复必须是 JSON **对象**，且恰好包含两个顶层键 — `languageDirective`（字符串）与 `outlines`（数组）。不要返回裸数组。不要用散文或代码围栏包裹。
