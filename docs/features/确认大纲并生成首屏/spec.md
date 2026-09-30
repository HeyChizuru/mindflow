---
feature_id: 确认大纲并生成首屏
artifact: spec
title: 确认大纲并生成首屏
spec_status: draft
delivery_status: planned
requires: [流式大纲与手改]
governed_by: [intent, adr-002-primary-storage]
related_to: []
supersedes: []
acceptance: [GF-1, GF-2, GF-3]
---

# 确认大纲并生成首屏

## 承诺

用户确认大纲后，系统生成可进入课堂的首屏场景（幻灯片或测验），而不等待其余场景全部完成。

## 非目标

不播放讲稿，不批改测验，不进行课堂讨论，不生成其余场景。

## 验收

- GF-1 WHEN 用户确认当前大纲，THE SYSTEM SHALL 生成可进入课堂的首屏场景。
- GF-2 WHEN 首屏生成成功，THE SYSTEM SHALL 允许进入课堂，而不等待其余场景。
- GF-3 WHEN 首屏生成失败，THE SYSTEM SHALL 展示可理解的错误并允许重试。

## 系统不变量

- 未确认大纲时不得把首屏当作可进入课堂的结果。
- 首屏成功后，重新进入仍能打开该场景。

## 非功能约束

- 失败信息不得泄露模型密钥或内部堆栈。

## 关系

- 硬能力依赖：[[features/流式大纲与手改/spec]]
- 治理约束：[[intent]]、[[adr-002-primary-storage]]
