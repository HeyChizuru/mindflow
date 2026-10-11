Generate scene outlines from the following course requirement.

---

## User Requirements

{{requirement}}

---

{{#if userProfile}}
## Learner profile

{{userProfile}}

---

{{/if}}
## Language context

Apply the language inference rules from the system prompt. The requirement language is the default teaching language unless the user overrides it.

{{#if retrievalExcerpts}}
---

## Document excerpts (from knowledge base)

Use only to inform topic and keyPoints. Do not invent citations or page numbers.

{{retrievalExcerpts}}

{{/if}}
---

## Output requirements

Infer from the user requirement:

- Course topic and core content
- Target audience and difficulty
- Course duration (default 15–30 minutes if unspecified)
- Teaching style (formal / casual / interactive / academic)
- Visual style (minimal / colorful / professional / playful)

Then output a **single JSON object**.

**Top-level shape — you MUST return:**

```json
{
  "languageDirective": "2-5 sentences describing course language behavior",
  "outlines": [ /* array of scene objects, schema below */ ]
}
```

Never return a bare array. Never omit `languageDirective`. Both keys are required.

**Each scene in the `outlines` array must include at least:**

```json
{
  "id": "scene_1",
  "type": "slide" | "quiz",
  "title": "Scene title",
  "description": "Teaching purpose",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "order": 1
}
```

### Special notes

- **Quiz scenes must include `quizConfig`**:
  ```json
  "quizConfig": {
    "questionCount": 2,
    "difficulty": "easy" | "medium" | "hard",
    "questionTypes": ["single", "multiple", "short_answer"]
  }
  ```
- **Scene count**: Based on inferred duration, typically 1–2 scenes per minute.
- **Quiz placement**: Insert a `quiz` every 3–5 `slide` scenes for assessment.
- **Language**: Infer from the requirement and context; output all scene content in that language.
- **If knowledge-base excerpts appear above**: Reflect facts and terms from the excerpts in `description` and `keyPoints`; do not invent page numbers, citations, or content not present in the excerpts.

**Final reminder**: Your entire response must be a JSON **object** with exactly two top-level keys — `languageDirective` (string) and `outlines` (array). Do not return a bare array. Do not wrap the JSON in prose or code fences.
