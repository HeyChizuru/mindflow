---
id: adr-003-external-service-boundary
artifact: adr
adr_status: accepted
---

# 外部服务边界（LLM / RAG）

## Context

文本生成与向量化走用户自带的 OpenAI 兼容端点。创建课堂不调用模型。有 PDF 时检索是可选增强，没有知识库时讨论仍须能进行。

## Decision

- 不在服务端用环境变量兜底用户的 LLM Key 与端点；由请求携带配置。缺配置则拒绝该次模型调用。
- Chat 与 Embedding 分头解析，互不代替。模型调用经统一封装，Route 不直接请求第三方 URL。
- 仅在该课堂已有知识库时检索；否则返回空引用，不报错。
- 不做：服务端代管多用户 Key、联网搜索、多厂商配置中心。

## Consequences

- 未配置模型时，入库与生成失败；界面须先引导设置。
- 生产环境须拒绝指向内网或云元数据的端点；本地开发可连本机推理。
- 环境变量示例若仍写服务端 Key，是文档漂移，须与本决定对齐，不改变决定本身。
- 换成非 OpenAI 兼容协议时，替代本 ADR。

## Alternatives considered

- 服务端 `.env` 统一 Key：方便运维，但与「用户自带 Key、密钥不进仓库」冲突，拒绝。
