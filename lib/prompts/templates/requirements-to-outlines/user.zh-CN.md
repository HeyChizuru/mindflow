请根据以下课程需求生成场景大纲。

---

## 用户需求

{{requirement}}

---

{{#if userProfile}}
## 学习者画像

{{userProfile}}

---

{{/if}}
## 语言说明

按 system 提示中的语言推断规则处理。默认以需求文本语言为授课语言，除非用户另有指定。

{{#if retrievalExcerpts}}
---

## 知识库摘录

仅用于丰富主题与 keyPoints。不要编造引用或页码。

{{retrievalExcerpts}}

{{/if}}
---

## 输出要求

请从用户需求中自动推断：

- 课程主题与核心内容
- 目标受众与难度
- 课程时长（未说明则默认 15–30 分钟）
- 教学风格（正式 / 轻松 / 互动 / 学术）
- 视觉风格（简约 / 多彩 / 专业 / 活泼）

随后输出**单个 JSON 对象**。

**顶层结构 — 你必须返回：**

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
  "type": "slide" | "quiz",
  "title": "场景标题",
  "description": "教学目的描述",
  "keyPoints": ["要点 1", "要点 2", "要点 3"],
  "order": 1
}
```

### 特别说明

- **quiz 场景必须包含 `quizConfig`**：
  ```json
  "quizConfig": {
    "questionCount": 2,
    "difficulty": "easy" | "medium" | "hard",
    "questionTypes": ["single", "multiple", "short_answer"]
  }
  ```
- **场景数量**：根据推断时长，通常每分钟 1–2 个场景。
- **测验插入**：建议每 3–5 张 `slide` 插入一次 `quiz` 以评估学习效果。
- **语言**：从用户需求文本与上下文推断，随后以推断语言输出全部场景内容。
- **若上文提供了知识库摘录**：在 `description` 与 `keyPoints` 中体现摘录中的事实与术语；不要编造页码、文档引用或摘录中未出现的内容。

**最终提醒**：你的完整回复必须是 JSON **对象**，且恰好包含两个顶层键 — `languageDirective`（字符串）与 `outlines`（数组）。不要返回裸数组。不要用散文或代码围栏包裹。
