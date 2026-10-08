---
feature_id: 创建课堂
artifact: plan
implements: [CC-1, CC-2, CC-3, CC-4]
governed_by: [adr-002-primary-storage, adr-003-external-service-boundary, adr-004-code-dependency-direction]
---

# 创建课堂后端接口

目标：把建课请求改成一层 `requirements`，把昵称和背景存进 `stage`，并能凭课堂 id 读回。只改服务端。首页表单、跳转和生成预览页不在本计划内。CC-1 / CC-3 里「进入生成预览」由后续前端用响应中的 `id` 完成。

不调用模型，不调用 `POST /api/stages/{id}/ingest`。不新增 ADR。

## 保持不变

这些已经符合规格，只回归：

- 提示词去空白后 10～10000 字。不合格在插入课堂之前返回 400。
- PDF 可选：类型为 PDF、非空、不超过 50MB。原件写入 `uploads/{stageId}/`，`documents` 只记文件名和路径。
- 创建成功为 201。`status` 为 `draft`，`previewPhase` 为 `preparing`，`hasKnowledgeBase` 为 `false`。
- 写文件或写文档失败时删除刚插入的课堂，不留半成品。
- 错误 JSON 只含可理解的 `error`，不含堆栈或密钥。500 仍用现有的 `"Failed to create stage"`。
- 课程标题仍由 `deriveStageName(requirement)` 推导，不用昵称。

## 请求与响应

`implements: CC-1, CC-2, CC-4`

无 PDF 时 `Content-Type: application/json`：

```json
{
  "requirements": {
    "requirement": "必填",
    "userNickname": "可选",
    "userBio": "可选"
  }
}
```

有 PDF 时 `multipart/form-data` 两个字段：`requirements`（上面这个对象的 JSON 字符串）和 `pdf`。不再读取平铺文本字段 `requirement`。

规范化后再入库、再回显：

- `requirement`：trim，长度 10～10000。
- `userNickname`、`userBio`：可省略。trim 后为空则视为未填，存 `NULL`，响应里省略该键。
- 未知字段（含 `interactiveMode`）丢掉，不入库。

201 响应用 `requirements` 替换现在的平铺 `requirement`。其余字段保持：`id`、`name`、`status`、`previewPhase`、`createdAt`、`hasKnowledgeBase`、可选 `document`。回显的是规范化后的对象，不是空字符串原样送回。

`requirements` 缺失、不是对象、或 JSON 字符串无法解析：400，且不插入 `stage`。只上传 PDF、没有合格提示词：同样 400。

## 存储

`implements: CC-2`　`governed_by: adr-002-primary-storage`

在 `stage` 上新增可空列，Prisma 字段与现有 `@map` 风格一致：

- `userNickname String? @map("user_nickname")`
- `userBio String? @map("user_bio")`

`requirement` 继续单独一列。不增加 `requirements` JSON 列，不用 `description` 存背景。把 `requirement` 注释从「仅 PDF 时可留空」改为必填提示词。用 `pnpm db:migrate` 增加这两列，然后 `pnpm db:generate`。

## 读取

`implements: CC-2, CC-3`

`GET /api/stages/{id}` 按列拼回同一份 `requirements`。有文档则带 `document` 的 `id`、`filename`、`storagePath`，不读 PDF、不返回 `rawText`。`hasKnowledgeBase` 读库中的实际值（刚创建时为 `false`）。课堂不存在返回 404。不改现有 DELETE。

## 分层

`governed_by: adr-004-code-dependency-direction`

沿现有方向改，不把 HTTP 状态码放进 service：

| 文件 | 改动 |
|---|---|
| `lib/types/stage.ts` | `CreateStageBody` 与创建/读取响应改为带 `requirements` |
| `lib/validators/stages.ts` | 请求与响应的 Zod；空白昵称、背景预处理为省略 |
| `prisma/schema.prisma` | 两列可空字段与 `requirement` 注释 |
| `lib/db/queries/stages.ts` | `insertStage` 写入两列；已有 `getStageById` 可复用 |
| `lib/services/stages.ts` | 创建时分别落列；抽出「行 → requirements DTO」；新增按 id 读取 |
| `app/api/stages/route.ts` | JSON 读 `body`；multipart 解析 `requirements` 字符串 |
| `app/api/stages/[id]/route.ts` | 增加 GET，保留 DELETE |

Service 在校验通过之后才 `insertStage`。multipart 的 JSON 解析失败在 Route 里映射为 400，与现有非法 JSON 体一致。

## 验证

仓库没有测试脚本。实现后用本地 `POST` / `GET` 核对，不测页面：

- CC-1：合法提示词、无 PDF → 201，响应含规范化 `requirements`，`hasKnowledgeBase` 为 `false`。
- CC-2：带昵称和/或背景创建后 `GET /api/stages/{id}` 读回同一份 `requirements`。两者都空白时响应不含这两个键。
- CC-3：合法 PDF → 201，带 `document`，`hasKnowledgeBase` 仍为 `false`，且没有调用 ingest。
- CC-4：提示词过短、`requirements` 坏 JSON、非 PDF、空 PDF、超过 50MB、只传 PDF 不传提示词 → 400，数据库无新 `stage` 行。

## 不做

- `app/page.tsx`、预览路由、历史列表。
- 文档入库、大纲、讨论。
- 昵称与背景的最少字数或超长拒绝。
