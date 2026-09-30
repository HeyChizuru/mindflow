---
feature_id: 后台续生成
artifact: spec
title: 后台续生成
spec_status: draft
delivery_status: planned
requires: [确认大纲并生成首屏]
governed_by: [intent, adr-002-primary-storage]
related_to: [课堂播放与测验]
supersedes: []
acceptance: [CN-1, CN-2, CN-3]
---

# 后台续生成

## 承诺

用户进入课堂后，其余场景在后台继续生成，并且不阻断首屏播放。生成成功的场景在刷新后仍可打开；失败的场景可以重试。

## 非目标

不重新生成已成功的首屏，不修改已确认大纲，不进行讨论或批改。

## 验收

- CN-1 WHEN 用户已进入课堂且仍有未生成场景，THE SYSTEM SHALL 在后台继续生成，且不阻断首屏播放。
- CN-2 WHEN 其余场景生成成功，THE SYSTEM SHALL 使其可被打开，并在刷新后仍然可用。
- CN-3 WHEN 某一场景生成失败，THE SYSTEM SHALL 展示可理解的错误并允许重试该场景。

## 系统不变量

- 后台生成不得覆盖用户已确认的大纲。
- 未完成的场景不得显示为已可播放的完成内容。

## 非功能约束

- 失败信息不得泄露模型密钥或内部堆栈。

## 关系

- 硬能力依赖：[[features/确认大纲并生成首屏/spec]]
- 治理约束：[[intent]]、[[adr-002-primary-storage]]
- 相关：[[features/课堂播放与测验/spec]]
