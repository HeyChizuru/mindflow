---
feature_id: 文档入库
artifact: spec
title: 文档入库
spec_status: draft
delivery_status: planned
requires: [创建课堂]
governed_by: [intent, adr-002-primary-storage, adr-003-external-service-boundary]
related_to: [配置模型]
supersedes: []
acceptance: [IN-1, IN-2, IN-3]
---

# 文档入库

## 承诺

课堂带有 PDF 时，用户可以看见明确的入库进度。入库成功后，后续大纲与讨论可以引用该文档。没有 PDF 的课堂不把入库当作继续主路径的前提。

## 非目标

不在创建课堂时解析正文。不生成大纲，不代替用户配置模型。

## 验收

- IN-1 WHEN 课堂有 PDF 且用户开始入库，THE SYSTEM SHALL 展示明确的处理进度。
- IN-2 WHEN 入库成功，THE SYSTEM SHALL 使后续大纲与讨论可以引用该文档。
- IN-3 WHEN 入库失败，THE SYSTEM SHALL 展示可理解的错误并允许重试。

## 系统不变量

- 无 PDF 的课堂不必入库即可继续。
- 入库未成功时，不得把该文档当作可引用的知识库。
- 引用范围不得跨到其他课堂的文档。

## 非功能约束

- 进度在入库过程中可见，而不是结束后才出现一次结果。
- 失败信息不得泄露模型密钥或内部堆栈。

## 关系

- 硬能力依赖：[[features/创建课堂/spec]]
- 治理约束：[[intent]]、[[adr-002-primary-storage]]、[[adr-003-external-service-boundary]]
- 相关：[[features/配置模型/spec]]
