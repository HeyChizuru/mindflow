默认先对齐再动手。对齐要求也适用于撰写或修改 spec、plan、task，不只是修改代码。  
必须遵守项目规范！！！

# Agent 协作风格

| 场景          | 做法                                                           |
| ----------- | ------------------------------------------------------------ |
| **新功能**     | 弄清目的与因果链，回馈理解后再谈方案；实现以对应 feature spec 为准，不擅自扩范围。             |
| **维护 / 删除** | 弄清维护或删除后要达成什么，评估牵涉模块，再出方案。                                   |
| **Bug**     | 先确认复现路径；分析时读相关 spec、代码与测试；与 intent / ADR / spec 冲突时先停，与用户对齐。 |

# 项目文档

`[docs/index.md](docs/index.md)` — 文档总索引；增删功能单元或调整依赖关系时请同步更新本页。

## 文档分层

- **spec**：写功能承诺、边界与验收标准。
- **plan**：写实施路线。小功能可以直接写清实施计划；较大功能只写阶段目标、范围、依赖和交付顺序，不提前展开具体文件、接口、表结构或操作步骤。
- **task**：写当前阶段的具体改动、实施步骤和验收映射；

# 项目规范(改代码和文档时务必遵守)

- 动手前读该功能 `[spec.md](docs/features/)`（承诺、验收 ID）；有则读同目录 `plan.md` / `tasks.md`，并对照代码与测试，确认文档未过期。
- 用户诉求、实现与文档不一致时：向用户说明（可标验收 ID 或 plan/tasks 条目）。先改文档，把文档与当前需求对齐（承诺→`spec`，路径与阶段→`plan`/`tasks`），再请用户确认文档是否合格；**用户确认后才能开始实现**。未对齐勿大规模改实现。
- 什么时候写task：写 spec / plan 时不自动展开 task；进行到对应阶段并且**用户要求时**，才写对应阶段的task。
- task怎么写：不要太复杂我无法审查，也不要太简单，使我不知道你要改哪些和新增哪些文件，和你的实现思路。(如果是可以在plan里写清的小功能，也要遵守)
- 文档:不要替用户决定会影响使用流程、数据保存或验收范围的规则。
- 测试：用户未明确说明时，不要写一堆测试文件，不要运行`pnpm build` ，如果写测试代码，用完后要删除。
- AGENTS.md：未允许时，不得随意改动此文件和规范

## Git 提交说明

- 功能单元尚未整体完成并验收时，阶段性提交标题不加 `feat`、`chore`、`docs` 等类型前缀，直接用中文描述本次改动。
- 只有单元完成 spec 验收、交付状态可标记为 `verified` 时，完成提交才使用 `feat(<feature_id>):<中文描述>`。
- `<feature_id>` 必须照抄对应 `docs/features/<单元目录>/spec.md` 中的正式值，不得缩写或用阶段名代替。

---

# 本地命令

使用 **pnpm**（仓库根目录）：

| 命令                 | 用途                               |
| ------------------ | -------------------------------- |
| `pnpm dev`         | 开发服务器，端口 **3001**                |
| `pnpm lint`        | ESLint                           |
| `pnpm build`       | `prisma generate` + `next build` |
| `pnpm start`       | 生产模式启动（需先 build）                 |
| `pnpm db:generate` | 生成 Prisma Client                 |
| `pnpm db:push`     | 推送 schema 到数据库（开发）               |
| `pnpm db:migrate`  | 迁移（开发）                           |
| `pnpm db:studio`   | Prisma Studio                    |

---

# 框架

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
