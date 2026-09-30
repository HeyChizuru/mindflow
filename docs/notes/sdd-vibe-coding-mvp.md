# 规格驱动开发：Vibe Coding 项目的 MVP 阶段

学习笔记。背景：用 AI 快速写代码（vibe coding）时，规格驱动（Spec-Driven Development, SDD）怎么用在 MVP，而不是做成瀑布。

单元化拆解、同 ID 追溯、Cursor rules：见 [spec-graph-practice.md](./spec-graph-practice.md)。

---

## 1. 一句话

SDD 不是一开始冻死架构，而是：**意图先写薄、主路径先跑通、即将实现的功能单元才写细规格。**  
Vibe coding 负责实现速度；规格负责不让 AI 替你做产品决策。

---

## 2. 和 vibe coding 的关系

| | 纯 vibe | MVP 阶段的 SDD |
|---|---|---|
| 输入 | 「帮我增加数据导出」 | 可演示的主路径 + 3～5 条验收 |
| 审查点 | 实现之后对着 diff 猜 | 规格 / 主路径图 / 当前功能单元验收 |
| 上下文 | 聊天记录易丢 | 薄 PRD + 当前功能单元的 spec |
| 适合 | 改文案、试 prompt、小修补 | 新功能、跨页、行为会歧义 |

两者不是对立。Vibe 缺的是门禁：需求含糊时模型会自己补全假设。

规格分层（不要混在一篇里锁死）：

| 层 | 回答 | MVP 怎么处理 |
|---|---|---|
| 产品意图（薄 PRD） | 给谁、主路径、成功标准、明确不做 | 开篇就写，相对稳 |
| 架构决策 / 治理约束 | 跨单元生效，修改成本较高 | 只记录真正影响多个单元的决定 |
| 工作架构 | 现在怎么拆 | 写成假设，允许打脸 |
| 功能规格 | 当前功能单元做什么、如何验收 | **该功能进入实现阶段时再写细** |

What / how 分开：规格写可验证的外部行为、系统不变量和非功能约束；技术选型放 ADR 或当前功能单元的 plan。

---

## 3. 开篇 PRD：写需求和少数定死项

要写，但第一版是 **2～5 页**，不是完整系统设计。

**写：**

- 给谁、解决什么、成功长什么样
- 明确不做（比「要做什么」更能挡住 AI 膨胀）
- 一条 happy path
- 少数高成本或跨单元约束（运行时、数据是否持久化、外部服务从哪一层调用）

**不写进开篇定死：**

- 完整目录树、每张表、每条 API
- 未来版本编排、功能开关、预留字段
- 「体验要好」这类无法验收的句子

更好的说法：

> 开篇 PRD = 项目需求 + 少量高成本或跨单元约束。  
> 可逆架构写成「当前假设」，允许被 MVP 打脸。

落地时不要再写一本总 PRD：需求进 `intent.md`，单元地图进 `_index.md`，硬约束进 ADR。见 [§11](#11-mvp-阶段要写的文档)。

需求本身也要薄：一条主路径讲完，优于十几条还没验证的未来功能。

---

## 4. MVP 长什么样（可检查，不靠形容词）

MVP ≠ 功能清单打八折。  
MVP = **一条路能走完，外人能看出价值，路上没有「这里以后再接」。**

### 4.1 三个测试

1. **演示测试**：没写过代码的人按 8～10 步说明书走完，你不用解释「这里以后会…」。
2. **恢复测试**：操作过程中刷新或重新进入，已经持久化的数据和进度仍可恢复。
3. **删减测试**：拿掉就断演示 → 属于 MVP；拿掉只是体验差一点 → 锦上添花，砍掉。

### 4.2 范围收法

先砍需求，再谈架构。拿掉后不会中断核心演示的能力，不进入首个可交付功能集。

一条合格的 MVP 演示路径通常包含：

1. 用户进入主要入口
2. 提供最小必要输入
3. 触发核心操作
4. 看见明确的处理中状态
5. 得到可使用的结果
6. 能完成一次最小后续操作
7. 刷新或重新进入后结果仍在
8. 失败时能看到可理解的错误和恢复方式

不是所有产品都需要八步；关键是从输入到价值交付没有「以后再接」。

### 4.3 首个可交付功能集的形态

| 维度 | 必须明确 | 暂不纳入 |
|---|---|---|
| 用户路径 | 一个完整的核心任务 | 次要入口、管理后台、复杂个性化 |
| 接口 | 支撑核心任务的最少接口 | 为未来功能预留的接口 |
| 数据 | 核心实体及恢复所需数据 | 暂无真实查询需求的字段和表 |
| 状态 | 主流程真实会经过的状态 | 未来编排可能使用的状态 |
| 错误处理 | 核心失败场景及恢复方式 | 低概率且无证据的假想分支 |

首个可交付功能集是可独立验收的产品切片，不等于完整的第一个正式版本。

---

## 5. 架构：要设计，但只设计会撞上、改起来贵的

砍掉锦上添花后，架构投入跟着变少，不是原样做完整架构。

**量级参考：半天、一页纸、少量关键决定。**  
这是启发式上限，不是硬指标；如果开始写未来版本目录、功能开关和假想扩展点，通常已经过度设计。

### 5.1 三种设计，只有前两种算 MVP 架构

| 种类 | 做不做 | 时长 | 产出 |
|---|---|---|---|
| 拍板高成本或跨单元选择 | 做 | 30～60 分钟 | 少量决定写进 ADR |
| 画主路径怎么走 | 做 | 约 1 小时 | 顺序图 + 真实会用到的状态 |
| 每个模块完整方案 | 不做 | — | 做到那一块再写 feature spec |

### 5.2 现在就锁的（换了等于换地基）

1. 部署形态：单体还是多个独立服务
2. 数据事实来源：哪些数据必须持久化，主存储是什么
3. 外部服务边界：从客户端还是服务端调用，凭证如何传递
4. 主用户路径：入口、处理中页面和结果页面如何衔接
5. 代码依赖方向：类型、校验、业务、数据访问、传输层如何分工
6. 异步交互方式：只有核心体验确实需要时，才选择流式、轮询或后台任务

**现在不锁：** 尚无真实需求支撑的扩展机制、插件协议、复杂编排、缓存层和预留字段。

### 5.3 必须画的：主路径，不是系统全景

```
用户提交最小输入
  → 接口校验请求
  → 领域服务执行核心操作
  → 写入主存储（created）
  → 执行必要处理（processing）
  → 保存结果（ready / error）
  → 结果页面读取并展示
```

这张图用来对照「这一步读写哪张表、哪个 API」，不是给未来功能留插槽。

### 5.4 代码：定目录，不定框架

值得定到文件夹这一层：

```
app/
  page.tsx
  result/[id]/page.tsx
  api/resources/route.ts

lib/
  types/resource.ts
  validators/resource.ts
  services/resource.ts
  db/resources.ts
```

内部实现可以先保持简单：一次调用能完成的处理，不必提前抽象成流水线。  
第二个真实用例出现，或同一段逻辑第二次发生变化时，再评估拆分。

**允许暂时简单：** 单个业务函数完成一次核心处理、页面组件直接管理少量局部状态。  
**不允许失去边界：** 传输层包含全部业务、数据只存在临时客户端状态、预留状态和字段无人读写。

规则：允许实现耦合，避免结构无边界。  
没有第二个真实调用方，不要抽接口 / 插件 / 事件总线。

### 5.5 明确不花精力的

- 未来版本预留列和状态
- 尚无第二种实现的功能开关
- 为假想分支设计的统一入口
- 六边形、流水线框架、多租户、队列

**演示路径用不到的扩展点，一律不设计。** 画了扩展点，AI 就会去实现。

### 5.6 节奏

| 何时 | 做什么 | 停手 |
|---|---|---|
| 砍完需求当天 | 6 条硬约束 + 主路径图 | ≤ 一页 |
| 开始某个功能单元之前 | 该单元的输入 / 输出 / 失败 | ~30 分钟，3 条验收即可 |
| 实现撞墙 | 只改那一条选择，记进修订记录 | 改一条，不重写全书 |

不要单独排「架构迭代」。不要对 AI 说「请先设计整体架构」。

---

## 6. 落地后再解耦：可行，但是有条件

顺序：

```
薄 PRD（意图 + 非目标 + 硬约束）
  → 带目录边界的 MVP（能跑，内部可乱）
  → 演示验证产品判断
  → 只拆已经痛过的耦合（一次一块）
  → 打脸结论写回 PRD
  → 下一个功能单元再写 feature spec
```

能做成：首个可交付功能集已经按职责划出基本边界；解耦的是反复变化的真实痛点；重构期少加功能；主路径还能走通。

会失败：无边界的一坨再「全面解耦」= 重写；一边加功能一边换架构；为想象中的规模抽抽象；让 AI 一次性重设计。

对 AI 下死命令：**保持对外行为不变，只拆这一处，不要借机重设计。**

产品意图都变了（主路径换了）→ 那是下一版产品，新开薄 PRD，不是在旧代码上硬解耦。

增加功能时应扩展已有边界或新增独立单元，而不是先制造一个无边界的大文件，再整体重写。

---

## 7. 和 AI 协作时怎么用规格

给模型的应是「约束 + 当前功能单元验收」，不是「请设计完整的未来系统」。

- 第一周不要让它写完整架构文档，让它按薄 PRD 打通主路径
- 每发现结构性问题记一条决策，不要重写全书
- 即将做的功能才写 feature spec；没排期的不要先写时序图
- 你拍板可逆 / 不可逆；模型会把所有选择写得很确定
- 宪法变更是大事；工作架构变更是日常

验收尽量写成可测试行为（EARS）：

> WHEN 用户提交有效表单，THE SYSTEM SHALL 创建可持久恢复的记录。  
> WHEN 后台处理完成，THE SYSTEM SHALL 允许用户重新进入并查看结果。  
> WHEN 外部服务超时，THE SYSTEM SHALL 展示可理解的错误并提供重试方式。

差规格：TBD、两处矛盾、「类似某某」、把实现细节写进需求。

---

## 8. 通用范围取舍

**首个可交付功能集保留：**

- 直接交付核心价值的最短用户路径
- 刷新或重新进入后的数据恢复
- 关键失败场景和恢复方式
- 最小必要的代码与数据边界

**首个可交付功能集暂缓：**

- 只改善体验、不影响核心任务完成的功能
- 尚未验证的高级自动化和复杂编排
- 为未来版本预留的字段、表、接口和抽象
- 没有第二个真实用例的插件化、通用化设计

### 8.1 先分类，再决定需要哪些工件

并非所有工作都必须走完整的 feature spec → plan → tasks 流程。

| 请求类型 | 最小流程 | 是否新增 feature spec |
|---|---|---|
| **Feature** | spec → plan/tasks → 实现 → 验证证据 | 通常需要 |
| **Bug** | 复现 → 明确正确行为 → 回归测试 → 修复 | 已有验收时不新建；没有时补充 |
| **Refactor** | 列出必须保持的验收 ID → 重构 → 回归验证 | 对外行为不变时不需要 |
| **Spike** | 假设 → 限时实验 → 丢弃或转正式 spec | 实验阶段不形成产品承诺 |
| **Emergency** | 先止血 → 补测试和原因 → 在约定时限内同步 spec/ADR | 仅在承诺发生变化时更新 |

Spike 的代码不能直接视为正式实现。实验结论若决定进入产品，先转成可验收的 spec，再按照正常流程实现。

### 8.2 成熟方案与存量项目

成熟方案减少的是设计不确定性，不会消除本地规格。此时 spec 的重点从“从零设计”转为：

- 哪些能力原样采用（adopt）
- 哪些能力按本地约束调整（adapt）
- 哪些能力明确不采用（omit）
- 哪些能力是本地新增（new）
- 哪些既有行为必须保持（preserve）

存量项目不要倒推整个系统的规格。先把稳定行为登记为 baseline，并为即将修改的区域补特征测试；新 spec 只描述变化、边界和必须保持的行为。

```yaml
origin:
  project: <reference-project>
  version: <reference-version>
  module: <reference-module>
adoption: adapt # adopt | adapt | omit | new
preserve:
  - <existing-behavior>
local_changes:
  - <local-difference>
```

如果成熟产品完全满足需求且不需要定制，不必重新开发；只写集成约束、配置、验收和回滚方式。

---

## 9. 常见坑

1. 把超长产品 PRD 当 feature spec → 模型仍在猜
2. 规格里写满实现（Zustand、某文件路径）→ 那是 plan
3. 写完规格不审查就开写 → 丢掉门禁
4. 实现漂了不改文档 → 规格再次过期（过期不是失败，停更才是）
5. 任务太大（「实现整个生成流水线」）
6. 为未发生的需求留扩展点
7. 「先烂后重构」永不还债，或重构做成第二版系统

---

## 10. 可直接用的检查清单

开篇（当天）：

- [ ] `intent.md`：一句话 + 明确不做 + 8 步演示
- [ ] 为首个功能集建立约 5 个 feature 目录，spec 可先保持 `draft`
- [ ] 少量 ADR（部署形态、主存储、外部服务边界、代码依赖方向）
- [ ] `_index.md` 从各 feature 的 frontmatter 生成，不手工复制状态和依赖

每个功能单元动手前：

- [ ] `spec_status: accepted`
- [ ] `requires` 中的能力都已 `delivery_status: verified`
- [ ] 同一 feature 目录下有 `plan.md`、`tasks.md`
- [ ] 每条验收 ID 映射到自动测试或人工证据
- [ ] `delivery_status: in_progress`；不碰未排期模块

准备加功能 / 解耦前：

- [ ] 演示是否已经通
- [ ] 是否已经痛过两次
- [ ] 是否能保持对外行为不变、只改一块
- [ ] 这是 feature、bug、refactor、spike 还是 emergency

---

## 11. MVP 阶段要写的文档

只保留必要工件。未来版本、完整 API 大全和功能开关说明书不该在这一阶段提前出现。

`intent.md` + `_index.md` 就相当于薄 PRD。若已有总 PRD，可将其作为迁移原料或历史归档；新承诺进入对应单元文件。

```
docs/
  intent.md                # 薄产品意图
  _index.md                # 由 frontmatter 生成，只读
  adr/
    001-deployment-shape.md
    002-primary-storage.md
    003-external-service-boundary.md
    004-code-dependency-direction.md
  features/
    submit-request/
      spec.md
      plan.md
      tasks.md
      evidence.md
    process-request/
      spec.md
      plan.md
      tasks.md
      evidence.md
```

同一功能的工件放在一起，`feature_id` 是关联主键。项目编码规范约束代码结构；AI rule 约束读取顺序和工作流；校验脚本负责保证 ID、引用和状态一致。

| 文档 | 作用 | MVP 篇幅 | 不写什么 |
|---|---|---|---|
| **`intent.md`** | 给谁、主路径、成功标准、明确不做 | 1～2 页 | 表结构、未来版本、每条 API、各单元验收 |
| **`_index.md`** | 生成的节点列表和依赖图 | 自动生成 | 手工维护状态和依赖 |
| **Feature spec（每个功能单元一篇）** | 当前单元的契约：承诺、非目标、验收、依赖 | 每篇 1 页内 | 其他单元的行为；实现细节 |
| **ADR（少量）** | 高成本、跨单元或反复争议的架构决定 | 每条半页 | 普通局部实现选择 |
| **Plan / tasks** | 实现方案和施工步骤 | 只服务当前 spec | 不得新增产品范围 |
| **Evidence** | 验收 ID 对应的测试和人工证据 | 按风险决定 | 不重复描述需求 |

**名词：** Feature spec = 某一个功能切片的契约（可验证行为、不变量、非功能约束）。ADR = 一条架构选择的立案（上下文、决定、后果）；被替代时标 `superseded`，不删。Plan 实现 spec；tasks 是施工单；evidence 证明验收已经通过。

**图谱约定：** 一目录一个功能单元，用 `requires` / `governed_by` / `related_to` / `supersedes` 表达不同关系。横向追溯：`spec.md` → `plan.md` → `tasks.md` → `evidence.md` 共用同一个 `feature_id`。做法、rules、迭代步骤见 [spec-graph-practice.md](./spec-graph-practice.md)。

**MVP 期间不写：** 完整未来架构手册、尚未排期的高级功能规格、预留扩展机制说明。

规格和交付使用两套状态：

```yaml
spec_status: draft | accepted | superseded
delivery_status: planned | in_progress | verified
```

`accepted` 表示契约获批；`verified` 表示所有验收都有证据。代码存在但尚未完成验证，不能标记为完成。

---

## 12. 各篇写什么

两篇总览分工：`intent.md` 管「我们在做哪个产品」（很少改）；`_index.md` 是由 feature frontmatter 生成的依赖和状态视图。验收条文不进这两篇。

### 12.1 `intent.md`

建议小标题：一句话 / 给谁 / 首个可交付功能集 / 明确不做 / 主路径 / 怎样算成功 / 治理约束（只链 ADR）。

```markdown
---
id: intent
artifact: intent
spec_status: accepted
---

# 产品意图

## 一句话
[目标用户]提供[最小必要输入]后，可以完成[核心任务]，并在重新进入后继续查看结果。

## 给谁
- [主要用户]：[最重要的使用场景]
- [次要用户]：[只有首个功能集确实服务时才填写]

## 首个可交付功能集
提交最小输入 → 处理请求 → 展示结果 → 重新进入后仍能恢复结果。

## 明确不做
- 不影响核心任务完成的体验增强
- 尚未验证的高级自动化和复杂编排
- 为未来版本准备的导入导出、插件化和管理功能

## 主路径
1. 用户进入主要入口
2. 提供最小必要输入
3. 提交请求
4. 看见明确的处理中状态
5. 得到可使用的结果
6. 完成一次最小后续操作
7. 重新进入后结果仍在
8. 失败时能理解原因并重试

## 怎样算成功
目标用户按上面主路径能独立完成核心任务；无需解释「这里以后会接」；数据可恢复。

## 治理约束
遵守 [[adr-001-deployment-shape]] [[adr-002-primary-storage]]
[[adr-003-external-service-boundary]] [[adr-004-code-dependency-direction]]。
```

「给谁」只写首个可交付功能集实际服务的用户，不要提前写未来版本场景。

### 12.2 `_index.md`

`_index.md` 是生成视图，不是第二个事实来源。依赖、状态和标题均读取各 feature 的 frontmatter；需要修改时回到源文件。

````markdown
# 规格索引

> Generated file. Do not edit manually.

## 能力依赖

```mermaid
flowchart LR
  submit-request --> process-request
  process-request --> view-result
```

## 单元

| feature_id | spec_status | delivery_status | requires | 文件 |
|---|---|---|---|---|
| submit-request | accepted | verified | — | [[features/submit-request/spec]] |
| process-request | accepted | in_progress | submit-request | [[features/process-request/spec]] |
| view-result | draft | planned | process-request | [[features/view-result/spec]] |
````

实现某个功能单元时，最小文档上下文是：该 spec、`requires` 指向的 spec、`governed_by` 指向的 intent/ADR、对应 plan/tasks。AI 仍需检查相关代码、测试和当前仓库状态；“最小上下文”不等于禁止代码调查。

### 12.3 Feature spec（每个功能单元一篇）

Feature spec 至少包含：承诺、非目标、验收、系统不变量、非功能约束和关系。不读其他功能正文，也能判断本单元应当表现成什么样。

```markdown
---
feature_id: process-request
artifact: spec
spec_status: accepted
delivery_status: planned
requires: [submit-request]
governed_by: [intent, adr-002-primary-storage]
related_to: [view-result]
supersedes: []
acceptance: [PR-1, PR-2, PR-3]
---

# 处理请求并保存结果

## 承诺
用户提交有效请求后，可以看到处理状态；处理成功的结果能够持久恢复。

## 非目标
不包含批量处理、数据导出和团队协作。

## 验收
- PR-1 WHEN 用户提交有效请求，THE SYSTEM SHALL 展示明确的处理中状态。
- PR-2 WHEN 处理成功，THE SYSTEM SHALL 持久保存结果，使用户重新进入后仍可查看。
- PR-3 WHEN 处理失败，THE SYSTEM SHALL 展示可理解的错误并允许重试。

## 系统不变量
- 不得向无权访问的用户返回结果。
- 重复提交不得产生不可控的重复副作用。

## 非功能约束
- 处理状态必须在目标响应时间内可见。
- 失败信息不得泄露凭证或内部堆栈。

## 关系
- 硬能力依赖：[[features/submit-request/spec]]
- 治理约束：[[intent]]、[[adr-002-primary-storage]]
```

过粗：一篇同时包含提交、处理、结果编辑、导出和权限。过细：为每个状态或事件单独写一篇。首个功能集通常 5～8 个单元足够。

### 12.4 ADR（每条一个决策）

```markdown
---
id: adr-002-primary-storage
artifact: adr
adr_status: accepted
---

# 选择主数据存储

## Context
核心结果必须在刷新和重新进入后恢复；当前没有多存储同步需求。

## Decision
选择一种持久化存储作为唯一事实来源；客户端状态只作临时缓存。

## Consequences
数据恢复路径明确。若未来出现离线、多区域或多主写入需求，再开新 ADR；本条被替代时标记为 superseded。
```

MVP 通常只记录少量跨单元决策：部署形态、主存储、外部服务边界、代码依赖方向。Feature spec 用链接引用，不把理由复制进每一篇。

### 12.5 Plan / tasks（同 ID）

- Plan：怎么做成。每条设计旁写 `implements: <AC-ID>` 或 `governed_by: <ADR-ID>`。
- Tasks：改哪些文件、命令、预期。每步写 `verifies: <AC-ID>`。
- Plan 可以增加内部实现任务和技术验证，但不得增加用户可见的产品范围；需要新行为时先改 spec。
- `feature_id` 必须与所在目录一致，`artifact` 分别为 `plan`、`tasks`。

### 12.6 Evidence（验收证据）

```yaml
feature_id: process-request
artifact: evidence
verification:
  PR-1:
    type: automated
    test: tests/process-status.test.ts
  PR-2:
    type: automated
    test: tests/result-persistence.test.ts
  PR-3:
    type: manual
    evidence: evidence/process-retry.md
```

验收证据可以是自动测试、人工验证记录、性能报告或安全检查。所有验收 ID 都有有效证据后，`delivery_status` 才能改为 `verified`。

---

## 13. MVP 之后文档怎么长

首个可交付功能集的节点都是 `verified`、核心演示通过后，就把这些验收视为当前承诺：以后增加功能默认不得破坏。要改变承诺，先修改或替代对应 spec。

之后按功能单元循环，不要补一本更大的 PRD：

```
选择下一个功能单元（requires 中的能力都已 verified）
  → 写/改该 feature spec
  → spec_status: accepted
  → 必要时新增 ADR（旧 ADR 被替代时标 superseded）
  → 同目录建立 plan、tasks
  → delivery_status: in_progress
  → 实现并为每条验收收集 evidence
  → 全部证据通过 → delivery_status: verified
```

| 后续变化 | 新增或修改 | 默认不动 |
|---|---|---|
| 增加批量处理 | `features/batch-processing/` | 单次请求规格 |
| 增加数据导出 | `features/data-export/` | 核心处理规格 |
| 更换主存储 | 新 ADR，并标记旧 ADR 为 superseded | 产品行为规格（若外部行为不变） |

对外行为不变的重构：tasks 里写清保持哪些验收 ID，不必新 spec。结构选择变了才补 ADR。禁止做完再从代码逆推当唯一规格。

### 13.1 规格变更与版本

- 文字澄清、错别字、未改变承诺的补充：保留 `feature_id`。
- 向后兼容的新验收：保留 `feature_id`，新增稳定的验收 ID；旧 ID 不重排。
- 删除或改变既有承诺：创建替代规格或新版本，并用 `supersedes` 指向旧规格。
- 旧规格改为 `spec_status: superseded`，保留历史和原有 evidence，不删除。
- 紧急修复若改变了产品承诺，应在约定时限内完成上述变更记录。