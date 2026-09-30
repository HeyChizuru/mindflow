---
id: adr-001-deployment-shape
artifact: adr
adr_status: accepted
---

# 部署形态（MVP）

## Context

MVP 以单体 Next.js 交付（页面 + API/SSE），无 Worker/BFF。持久化依赖 PostgreSQL（pgvector）与本地可写目录存放 PDF。无用户登录，API 以 `stageId` 为边界，面向本地 demo / 作品集。

## Decision

- 部署单元：一个 Next 进程 + 一个 Postgres + 可写 uploads 目录。
- 不做：独立 Agent Worker、OpenMAIC Pro Runtime。
- 生产若改为 serverless 或拆后台任务：须另开 ADR（超时、PDF 不能依赖本机磁盘等）。

## Consequences

- 换部署平台前须核对 Route 时限与 PDF 体积上限。
- 对外暴露须另开安全 / 鉴权 ADR；持有 `stageId` 即可访问该课堂。
- 本地 Compose 或启动说明应与上述形态一致。缺 Compose 是工具链缺口，不是部署形态变更。

## Alternatives considered

