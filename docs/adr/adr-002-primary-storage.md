---
id: adr-002-primary-storage
artifact: adr
adr_status: accepted
---

# 主数据存储

## Context

刷新或重新进入后，已持久化的课堂与生成结果必须仍可恢复。客户端草稿不能当事实来源。大纲是生成中间产物，播放终态是场景；MVP 没有 Plan 蓝图这一层。

## Decision

- 唯一持久化：PostgreSQL。根实体为 `stage`。后续 `scenes` 与聊天表进入同一库，不另起第二套存储。
- RAG 向量只放在 chunk 行上，不单独建向量表。PDF 原件在本地目录，库中只存路径与元数据。
- 执行稿大纲用 `stage` 上的 JSON，不建大纲表。客户端存储只作草稿或 UI 缓存。
- MVP 不读写 Plan 蓝图列（保持空）。

## Consequences

- 换 embedding 维度或模型须迁移并重新入库，不能悄悄改列。
- 启用 Plan 存储须新开或替代本 ADR，不能在 MVP 里悄悄写入蓝图列。
- 表字段与生命周期细节见 DATA-MODEL；与 intent 冲突时以 intent 与 feature spec 为准。

## Alternatives considered

- 大纲单独建表：迁移和原子更新更重，MVP 拒绝。
- IndexedDB 或仅浏览器存储作为真相：无法满足重新进入后的恢复，拒绝。
