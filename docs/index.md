# 文档总索引


用本页定位文档。功能决策看产品意图和架构决策；某个功能的可验收行为看功能模块；表结构、接口和实现顺序看模块参考。

# 总需求文档

- [产品意图](./intent.md)：产品边界、主路径、明确不做。

## 功能决策

架构决策在 [adr](./adr)。这里只列标题，决定写在各篇 ADR 里。

- [部署形态（MVP）](./adr/adr-001.md)
- [主数据存储](./adr/adr-002.md)
- [外部服务边界（LLM / RAG）](./adr/adr-003.md)
- [代码依赖方向](./adr/adr-004.md)

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
  "确认大纲并生成首屏" --> "课堂讨论"
```

| feature_id | spec_status | delivery_status | requires | 文件 |
|---|---|---|---|---|
| 创建课堂 | accepted | in_progress | — | [spec](./features/创建课堂/spec.md) |
| 后台续生成 | draft | planned | 确认大纲并生成首屏 | [spec](./features/后台续生成/spec.md) |
| 课堂播放与测验 | draft | planned | 确认大纲并生成首屏 | [spec](./features/课堂播放与测验/spec.md) |
| 课堂讨论 | draft | planned | 确认大纲并生成首屏 | [spec](./features/课堂讨论/spec.md) |
| 流式大纲与手改 | draft | planned | 创建课堂 | [spec](./features/流式大纲与手改/spec.md) |
| 配置模型 | draft | planned | — | [spec](./features/配置模型/spec.md) |
| 确认大纲并生成首屏 | draft | planned | 流式大纲与手改 | [spec](./features/确认大纲并生成首屏/spec.md) |
| 文档入库 | draft | planned | 创建课堂 | [spec](./features/文档入库/spec.md) |

## 笔记

写法参考，不是当前产品承诺。

- [规格驱动开发：Vibe Coding 项目的 MVP 阶段](./notes/sdd-vibe-coding-mvp.md)：规格驱动的写法。
- [规格图谱实践：单元化、依赖、横向追溯](./notes/spec-graph-practice.md)：功能目录、依赖和验收如何连成图谱。
