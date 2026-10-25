# 文档总索引

用本页定位文档。功能决策看产品意图和架构决策；某个功能的可验收行为看功能模块；表结构、接口和实现顺序看模块参考。

# 总需求文档

- [产品意图](./intent.md)：产品边界、主路径、明确不做。

## 视觉规范

- [品牌视觉](./brand.md)：已确认的「灵感生长」Logo、颜色、深浅背景版本与图标使用方式。

## 功能决策

架构决策在 [adr](./adr)。这里只列标题，决定写在各篇 ADR 里。

- [部署形态（MVP）](./adr/adr-001.md)
- [主数据存储](./adr/adr-002.md)
- [外部服务边界（LLM / RAG）](./adr/adr-003.md)
- [代码依赖方向](./adr/adr-004.md)
- [大纲何时入库](./adr/adr-005.md)
- [测验提交与评分并发](./adr/adr-006.md)
- [课堂问答的 Agent 编排边界（草案）](./adr/adr-007.md)

## 功能模块

某个功能能否验收，看该单元的 spec。状态和依赖来自各 spec 的 frontmatter。

```mermaid
flowchart LR
  "配置模型"
  "创建课堂" --> "文档入库"
  "创建课堂" --> "流式大纲与手改"
  "流式大纲与手改" --> "确认大纲并生成首屏"
  "确认大纲并生成首屏" --> "后台续生成"
  "确认大纲并生成首屏" --> "课堂播放与测验"
  "课堂播放与测验" --> "课堂讨论"
```




| feature_id | spec_status | delivery_status | requires  | 文件                                                                      |
| ---------- | ----------- | --------------- | --------- | ----------------------------------------------------------------------- |
| 创建课堂       | accepted    | verified        | —         | [spec](./features/创建课堂/spec.md) · [plan](./features/创建课堂/plan.md)       |
| 后台续生成      | draft       | planned         | 确认大纲并生成首屏 | [spec](./features/后台续生成/spec.md) · [plan](./features/后台续生成/plan.md) · [阶段一后端 tasks](./features/后台续生成/tasks-后端地基.md) · [阶段二联调 tasks](./features/后台续生成/tasks-前后端打通.md) · [阶段三 UI tasks](./features/后台续生成/tasks-UI与交互.md) · [阶段四审查 tasks](./features/后台续生成/tasks-审查与修复.md) · [验收记录](./features/后台续生成/验收记录.md) |
| 课堂播放与测验    | draft       | planned         | 确认大纲并生成首屏 | [spec](./features/课堂播放与测验/spec.md) · [plan](./features/课堂播放与测验/plan.md) · [阶段二 tasks](./features/课堂播放与测验/tasks-范围清理.md) · [阶段三后端 tasks](./features/课堂播放与测验/tasks-后端适配.md) · [阶段四前端静态 tasks](./features/课堂播放与测验/tasks-前端静态.md) · [阶段五联调记录](./features/课堂播放与测验/联调交付记录.md) |
| 课堂讨论       | draft       | in_progress     | 课堂播放与测验 | [spec](./features/课堂讨论/spec.md) · [plan](./features/课堂讨论/plan.md) · [阶段一 tasks](./features/课堂讨论/tasks-旧讨论清理与访问边界.md) · [阶段二 tasks](./features/课堂讨论/tasks-聊天保存与恢复.md) |
| 流式大纲与手改    | accepted    | verified        | 创建课堂      | [spec](./features/流式大纲与手改/spec.md) · [plan](./features/流式大纲与手改/plan.md) |
| 配置模型       | draft       | planned         | —         | [spec](./features/配置模型/spec.md)                                         |
| 确认大纲并生成首屏  | draft       | planned         | 流式大纲与手改   | [spec](./features/确认大纲并生成首屏/spec.md) · [plan](./features/确认大纲并生成首屏/plan.md) · [阶段一 tasks](./features/确认大纲并生成首屏/tasks-确认大纲.md) · [阶段二后端 tasks](./features/确认大纲并生成首屏/tasks-首屏生成-后端.md) · [阶段二前端 tasks](./features/确认大纲并生成首屏/tasks-首屏生成-前端.md) |
| 文档入库       | accepted    | in_progress     | 创建课堂      | [spec](./features/文档入库/spec.md)                                         |

2026-10-25：课堂讨论采用用户主动展开右侧聊天、系统每轮选择一名教师的契约；相关生成与播放 spec 同步取消 `discussion` 动作。阶段一旧动作清理与教师上下文、阶段二聊天保存与恢复已实施，局部验证及其边界见各阶段 task 的交付记录；LangGraph 与前端问答尚未接入。表中受影响单元的状态对应变更后的规格，原有 plan、tasks 与验收记录保留历史交付证据，不代表完整新契约已交付。

