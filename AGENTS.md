# Agent 协作风格

默认先对齐再动手


| 场景          | 做法                                                           |
| ----------- | ------------------------------------------------------------ |
| **新功能**     | 弄清目的与因果链，回馈理解后再谈方案；实现以对应 feature spec 为准，不擅自扩范围。             |
| **维护 / 删除** | 弄清维护或删除后要达成什么，评估牵涉模块，再出方案。                                   |
| **Bug**     | 先确认复现路径；分析时读相关 spec、代码与测试；与 intent / ADR / spec 冲突时先停，与用户对齐。 |


# 项目文档

 `docs/index.md` — 文档总索引；增删功能单元或调整依赖关系时请同步更新本页。

# 实现前读什么

**最小文档上下文**：
 1.该功能的 [docs/features//spec.md](docs/features/) — 承诺、验收 ID、不变量。该功能的可验收契约；改行为先改 spec，再改代码。
 2.同目录下的 `plan.md` / `tasks.md`（若存在，仅作施工参考）。

**`仍须读代码与测试**。「最小上下文」不等于禁止查看实现、Prisma schema、现有 Route 与测试文件。

---

# 本地命令

使用 **pnpm**（仓库根目录）：


| 命令                 | 用途                                             |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | 开发服务器，端口 **3001**                              |
| `pnpm lint`        | ESLint                                         |
| `pnpm build`       | `prisma generate` + `next build`               |
| `pnpm start`       | 生产模式启动（需先 build）                               |
| `pnpm db:generate` | 生成 Prisma Client                               |
| `pnpm db:push`     | 推送 schema 到数据库（开发）                             |
| `pnpm db:migrate`  | 迁移（开发）                                         |
| `pnpm db:studio`   | Prisma Studio                                  |


---



# 框架



# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

