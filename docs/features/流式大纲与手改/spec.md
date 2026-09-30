---
feature_id: 流式大纲与手改
artifact: spec
title: 流式大纲与手改
spec_status: draft
delivery_status: planned
requires: [创建课堂]
governed_by: [intent, adr-002-primary-storage, adr-003-external-service-boundary]
related_to: [文档入库, 配置模型]
supersedes: []
acceptance: [EO-1, EO-2, EO-3]
---

# 流式大纲与手改

## 承诺

用户可以看到大纲逐步出现，并在确认前手改标题、描述和要点。已保存的大纲草稿在刷新后仍在。

## 非目标

不通过对话修改大纲。不确认大纲，不生成课堂场景，不实现课程蓝图或评审循环。

## 验收

- EO-1 WHEN 大纲正在生成，THE SYSTEM SHALL 逐步展示大纲条目。
- EO-2 WHEN 用户在确认前修改标题、描述或要点，THE SYSTEM SHALL 保留这些修改。
- EO-3 WHEN 大纲草稿已经保存后用户刷新，THE SYSTEM SHALL 仍能看到该草稿。

## 系统不变量

- 无 PDF 时仍可根据课程需求生成大纲。
- 有 PDF 但入库未成功时，不得把文档引用当作已经可用。
- 生成过程中的中间结果不得被当成已确认大纲。

## 非功能约束

- 生成失败时给出可理解的原因，并允许重新生成。
- 失败信息不得泄露模型密钥或内部堆栈。

## 关系

- 硬能力依赖：[[features/创建课堂/spec]]
- 治理约束：[[intent]]、[[adr-002-primary-storage]]、[[adr-003-external-service-boundary]]
- 相关：[[features/文档入库/spec]]、[[features/配置模型/spec]]
