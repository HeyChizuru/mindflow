# 规格图谱实践：单元化、依赖、横向追溯

学习笔记。把规格拆成关系图谱（参考 Obsidian：一个功能目录对应一个闭环契约，用显式关系连接），让每个单元可单独验收、单独迭代；spec / plan / tasks / evidence 共享 `feature_id`，形成横向追溯。

MVP 原则、请求分类和文档模板见 [sdd-vibe-coding-mvp.md](./sdd-vibe-coding-mvp.md) §8–13。本篇只记 **如何组织图谱、区分关系、验证一致性和完成迭代**。

---

## 1. 一句话

规格不要做成一本越改越碎的总书，而要做成一张图：**节点是闭环契约，边表达不同关系，同一功能目录内放 spec、plan、tasks 和 evidence。**

Spec 是活契约、硬执行：没改契约之前实现必须守；要改行为，先改那一篇 spec，再改代码。图谱解决的是「契约存在哪、改哪一篇、AI 加载哪些文件」。

---

## 2. 针对什么问题

一本超长总 PRD 里，所有承诺挤在一起。迭代只能在同一份文件里改，于是：

- 修改一项能力时会碰到大量无关未来功能，范围被带跑
- Git diff 全是总书噪声，看不出当前功能单元改了哪条契约
- AI 一次读完全文，仍在猜「这次到底做哪一段」
- 实现漂了只能从结果逆推，规格变成现状说明书，失去裁决权

图谱化之后：修改 `features/process-request/spec.md` 不动其他功能规格；追溯从验收 ID 到 task 和 evidence，不必考古总书。

---

## 3. 两个方向

**纵向 = 能力依赖（谁必须先验证完成）**

```
[[submit-request]] → [[process-request]] → [[view-result]]
```

`process-request` 写明 `requires: [submit-request]`。只有 `submit-request` 已经 `verified`，`process-request` 才能进入实现。  
这既限定实现就绪条件，也限定最小文档上下文；AI 仍需检查相关代码和测试。

**横向 = 同一功能单元的四种工件**

```
spec.md → plan.md → tasks.md → evidence.md
承诺什么   怎么实现   如何施工    如何证明
```

四者位于同一目录并共享 `feature_id`。没有 accepted spec 的功能不得进入正式实现；尚未排期的功能可以只有 draft spec。

---

## 4. 一个单元什么才算切对

同时满足：

- 有独立演示或独立验收（不是「半个按钮」）
- 硬能力依赖能列完，通常不超过 1～3 个
- 愿意单独开一个 AI 会话只做它
- 不读其他功能正文也能判断契约是否满足（承诺 / 非目标 / 验收 / 不变量 / 非功能约束）

闭环测试：只实现本单元 + 已 `verified` 的硬依赖，能否独立证明本单元的验收。能，就切对了。

过粗：一篇同时包含提交、处理、编辑、导出和权限 → 还是小总书。  
过细：为每个状态或内部事件单独建 feature → 依赖图比产品还复杂。

首个可交付功能集通常 5～8 个功能节点足够。`intent` 和 ADR 是治理节点，不参与功能交付状态。

---

## 5. 目录与 frontmatter

```
docs/
  intent.md
  _index.md                # 自动生成，不手工维护状态
  adr/
    001-deployment-shape.md
  features/
    process-request/
      spec.md
      plan.md
      tasks.md
      evidence.md
```

按功能聚合的好处：一起变化的工件位于同一目录，完成后可整体归档，不再依靠三个目录中的同名文件维持关系。

Spec frontmatter 是该功能的事实来源：

```yaml
feature_id: process-request
artifact: spec
title: 处理请求并保存结果
spec_status: accepted       # draft | accepted | superseded
delivery_status: planned    # planned | in_progress | verified
requires: [submit-request]
governed_by: [intent, adr-002-primary-storage]
related_to: [view-result]
supersedes: []
acceptance: [PR-1, PR-2, PR-3]
```

状态必须分开：

- `spec_status` 描述契约：`draft → accepted → superseded`
- `delivery_status` 描述交付：`planned → in_progress → verified`
- ADR 使用 `adr_status: proposed | accepted | superseded`

`accepted` 不等于已经实现；`verified` 要求所有验收 ID 都有有效 evidence。`superseded` 的旧规格和证据保留，不删除。

### 5.1 关系字段不能混用

```yaml
requires: [submit-request]               # 硬能力依赖；未 verified 会阻塞实现
governed_by: [intent, adr-002]            # 必须遵守，不参与交付状态
related_to: [view-result]                 # 相关，但不阻塞
supersedes: [process-request-v1]          # 本规格替代谁
```

不要再维护 `unlocks`：它只是 `requires` 的反向关系，应由索引生成。正文可以用链接帮助阅读，但 frontmatter 才是机器校验的关系来源。

### 5.2 字段说明

#### Feature spec 字段

| 字段 | 含义 | 约束 |
|---|---|---|
| `feature_id` | 功能单元的稳定唯一标识，也是目录名 | 同目录的 spec / plan / tasks / evidence 必须一致；标题变化时通常不改 |
| `artifact` | 当前文件的工件类型 | 取值为 `spec` / `plan` / `tasks` / `evidence` |
| `title` | 给人阅读的功能名称 | 可修改，不作为文件关联主键 |
| `spec_status` | 契约本身的生命周期 | `draft` → `accepted` → `superseded` |
| `delivery_status` | 功能交付进度 | `planned` → `in_progress` → `verified` |
| `requires` | 当前功能成立所需的硬能力依赖 | 被依赖能力未 `verified` 时，当前功能不能完成最终集成验证 |
| `governed_by` | 当前功能必须遵守的产品意图和 ADR | 只表示治理约束，不参与功能交付状态 |
| `related_to` | 与当前功能相关、但不阻塞实现的单元 | 用于导航和补充上下文 |
| `supersedes` | 当前规格替代的旧规格 | 旧规格标为 `superseded`，但不删除历史和 evidence |
| `acceptance` | 本规格定义的验收条件 ID | ID 必须在正文中存在，并被 plan / tasks / evidence 引用；已发布 ID 不重排 |

`spec_status` 和 `delivery_status` 必须分开理解：

- `accepted`：契约已经确认，不代表代码已经实现。
- `in_progress`：实现和验证正在进行，规格仍保持 `accepted`。
- `verified`：所有验收 ID 都已有有效证据。
- `superseded + verified`：旧规格当时通过过验收，但现在已被新规格替代。

#### Plan / tasks / evidence 字段

| 字段 | 所在工件 | 含义 |
|---|---|---|
| `feature_id` | 全部 | 关联到同一功能目录和 spec |
| `artifact` | 全部 | 分别填写 `plan`、`tasks`、`evidence` |
| `implements` | plan | 该设计实现哪些验收 ID |
| `governed_by` | plan | 该设计受哪些 ADR 约束 |
| `verifies` | tasks | 该任务完成后验证哪些验收 ID |
| `verification` | evidence | 验收 ID 到自动测试、人工记录、性能报告或安全检查的映射 |

例如：

```yaml
# evidence.md
feature_id: process-request
artifact: evidence
verification:
  PR-1:
    type: automated
    test: tests/process-status.test.ts
  PR-2:
    type: manual
    evidence: manual/result-recovery.md
```

#### ADR 字段

| 字段 | 含义 |
|---|---|
| `id` | ADR 的稳定唯一标识，例如 `adr-002-primary-storage` |
| `artifact` | 固定为 `adr` |
| `adr_status` | `proposed` / `accepted` / `superseded` |

ADR 被替代时保留原文件，由新 ADR 说明替代理由，并将旧 ADR 标记为 `superseded`。

#### 成熟方案采用字段

| 字段 | 含义 |
|---|---|
| `origin` | 参考方案的项目、版本和模块 |
| `adoption` | `adopt` 原样采用、`adapt` 本地调整、`omit` 明确不采用、`new` 本地新增 |
| `preserve` | 必须保持的既有行为 |
| `local_changes` | 相比参考方案的本地差异 |

---

## 6. 各层写什么（短）

| 层 | 只回答 | 强制引用 |
|---|---|---|
| **intent** | 做哪个产品、主路径、明确不做 | 链 ADR，不写各单元验收 |
| **\_index** | 有哪些节点、谁依赖谁、交付到哪 | 从 frontmatter 生成，不手工编辑 |
| **feature spec** | 可验证行为、不变量、失败和非功能约束 | `requires` / `governed_by`；验收用稳定 ID |
| **ADR** | 高成本、跨单元或反复争议的选择 | 被 spec 的 `governed_by` 引用 |
| **plan** | 怎么做成、风险、迁移和回滚 | 每条设计写 `implements: <AC-ID>` 或 `governed_by: <ADR-ID>` |
| **tasks** | 改哪些文件、命令、预期 | 每步写 `verifies: <AC-ID>` |
| **evidence** | 怎样证明验收已通过 | 每个验收 ID 映射到测试或人工证据 |

Plan 可以增加内部实现任务和技术验证，但不得增加用户可见产品范围。需要新行为 → 先改 spec。Tasks 是施工单，不是第二份规格。

已有总 PRD 可作为迁移原料或历史归档。产品级变化写进 intent，功能承诺写进 feature spec，架构决策写进 ADR，避免双轨维护。

---

## 7. AI rules 负责流程，脚本负责事实

单独建立一条规格工作流 rule，不要与代码风格规则混在一起。要点：

1. Feature 改变产品行为时，先修改 `features/<feature_id>/spec.md`。
2. Plan/tasks/evidence 必须与 spec 位于同一 feature 目录并共享 `feature_id`。
3. Plan 不得新增 spec 没有的产品行为；发现缺口先暂停并更新 spec。
4. 实现某单元时，最小文档上下文是该 spec、`requires` 的 spec、`governed_by` 的 intent/ADR、对应 plan/tasks。
5. AI 仍需读取相关代码和测试，不能把“最小文档上下文”理解为禁止代码调查。
6. 根据请求类型使用 feature / bug / refactor / spike / emergency 对应流程。

Rules 是软约束，不能承担一致性校验。增加轻量脚本并在 CI 或提交前检查：

- `feature_id` 是否唯一且与目录名一致
- `requires`、`governed_by`、`related_to`、`supersedes` 引用是否存在
- `requires` 图是否存在环
- plan/tasks/evidence 是否存在对应 spec，且 `feature_id` 一致
- `implements` / `verifies` 是否引用真实验收 ID
- `in_progress` 的硬依赖是否全部 `verified`
- `verified` 是否覆盖全部验收证据
- 状态值和状态迁移是否合法

`_index.md` 由同一脚本生成。图谱事实来自 frontmatter；Obsidian、AI rule 和 `_index` 都是消费者。

---

## 8. 一次迭代怎么走

1. **分类请求**：feature / bug / refactor / spike / emergency。
2. **定位功能节点**：新建或修改 feature 目录；列出 `requires` 和 `governed_by`。
3. **评审规格**：行为、边界、失败、不变量、非功能约束完整后，设 `spec_status: accepted`。
4. **确认就绪**：`requires` 中的能力全部 `verified`；否则只能继续设计，不能进入正式实现。
5. **准备实现**：写 `plan.md`、`tasks.md`，检查每条设计和任务能追溯到验收 ID 或 ADR；设 `delivery_status: in_progress`。
6. **实现与验证**：运行自动测试，记录人工证据、性能报告或安全检查。
7. **完成**：所有验收 ID 都有有效 evidence 后，设 `delivery_status: verified`。

Git diff 应集中在一个 feature 目录、相关代码和测试，而不是整本 PRD。

### 8.1 其他请求类型

- **Bug**：已有验收时，先写失败的回归测试再修复；缺少正确行为定义时补充 spec。
- **Refactor**：不新增 feature spec；tasks 列出必须保持的验收 ID，完成后跑回归证据。
- **Spike**：记录假设、时间盒和结论；实验代码丢弃或转正式 spec，不能直接标 `verified`。
- **Emergency**：允许先止血，但必须在约定时限内补原因、测试以及必要的 spec/ADR 变更。

### 8.2 规格变更

- 未改变承诺的澄清：保留 `feature_id`。
- 向后兼容的新行为：保留 `feature_id`，新增验收 ID，旧 ID 不重排。
- 删除或改变既有承诺：创建替代规格或新版本，用 `supersedes` 指向旧规格。
- 旧规格设为 `spec_status: superseded`，历史 plan/tasks/evidence 均保留。

### 8.3 成熟方案和存量系统

不用把整个既有系统重新规格化。把稳定行为登记为 baseline，为即将修改的区域补特征测试，然后只规格化差异：

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

baseline 只有在特征测试或其他证据确认后，才可登记为 `verified`。成熟方案提供实现参考，本地 spec 负责记录采用边界、本地差异和必须保持的行为。

---

## 9. Obsidian 只是呈现

把 `docs/` 当知识库打开即可。

- Graph view / `_index` 的 mermaid：给人看孤岛、环和下一个可实现单元
- AI 工具不依赖图形界面，它读取文件、frontmatter、链接和 rules
- 约定一种链接即可：`[[features/submit-request/spec]]` 或相对 Markdown 链接，团队统一

没有 Obsidian 也能实践。先建立 feature 目录、关系字段和校验脚本，再谈图好不好看。

检查图时：

- 孤岛：无人依赖也无依赖 → 可能是独立能力，也可能漏写关系，需要人工确认
- 环：A 依赖 B、B 依赖 A → 切分错了，应合并或抽出真正的前置
- 过宽：一个节点有大量硬依赖 → 功能单元可能过大，应检查是否能拆分

---

## 10. 和 MVP 原则怎么咬合

| 原则 | 图谱里怎么体现 |
|---|---|
| 薄 PRD | `intent` + 生成的 `_index` + 少量 ADR，不是超长总书 |
| 临近实现再写细规格 | 单元可保持 `spec_status: draft`，排期前再评审 |
| 活契约、硬执行 | 改承诺先改 spec，再同步同目录的 plan/tasks/evidence |
| 不从结果逆推当唯一规格 | 先有单元验收，再有实现；代码多出来的字段不自动写进 spec |
| 架构只记录重要决定 | 高成本、跨单元或反复争议的决定进 ADR；局部设计留在 plan |
| 完成必须可证明 | 验收 ID → plan → task → evidence → verified |

---

## 11. 检查清单

开库 / 开篇：

- [ ] `intent.md`、少量 ADR、首个功能集的 feature 目录
- [ ] spec frontmatter 使用 `feature_id` 和四类关系字段
- [ ] AI rule 约束工作流
- [ ] 校验脚本检查 ID、引用、环、验收映射和状态
- [ ] `_index.md` 可重复生成，不手工维护状态

每个功能单元：

- [ ] `spec_status: accepted`
- [ ] `requires` 中的能力均为 `verified`
- [ ] plan/tasks 的 `implements` / `verifies` 能对上验收 ID
- [ ] AI 加载最小文档上下文，同时检查相关代码和测试
- [ ] `delivery_status: in_progress`

做完：

- [ ] 每条验收都有自动测试或人工证据
- [ ] `delivery_status: verified`
- [ ] `_index.md` 重新生成且校验脚本通过
- [ ] 没有「做完再从代码归纳成规格」作为唯一文档

---

## 12. 常见坑

1. 总书和图谱双轨更新 → 产品级变化进 intent，功能承诺进 spec，总书仅作迁移原料或归档
2. 切太细，图谱比产品复杂
3. 切太粗，一篇又变总书
4. 为未开工单元预写 plan/tasks
5. Plan 里塞进 spec 没有的产品行为或未来扩展点
6. 把 `spec_status` 和 `delivery_status` 混成一套状态
7. `_index` 和 frontmatter 同时手工保存状态，形成两个事实来源
8. 同时维护 `requires` 和反向 `unlocks`，最终相互漂移
9. 只有 rules，没有机器校验
10. 代码存在就标完成，没有 evidence
11. 把 Obsidian 插件当工作流本身（真正生效的是 frontmatter、校验脚本和版本历史）
