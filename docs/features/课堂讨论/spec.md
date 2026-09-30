---
feature_id: 课堂讨论
artifact: spec
title: 课堂讨论
spec_status: draft
delivery_status: planned
requires: [确认大纲并生成首屏]
governed_by: [intent, adr-002-primary-storage, adr-003-external-service-boundary]
related_to: [文档入库, 课堂播放与测验, 配置模型]
supersedes: []
acceptance: [DS-1, DS-2, DS-3]
---

# 课堂讨论

## 承诺

用户可以向固定的三名 Agent 提问，并得到与当前课程相关的回答。课堂已有可用知识库时，回答展示文档引用；没有知识库时仍可讨论，且不展示伪造引用。

## 非目标

不自动生成 Agent 人设，不联网搜索，不通过讨论修改大纲，不播放讲稿。

## 验收

- DS-1 WHEN 用户在课堂中提问，THE SYSTEM SHALL 由固定的三名 Agent 给出与当前课程相关的回答。
- DS-2 WHEN 该课堂已有可用知识库，THE SYSTEM SHALL 在回答中展示文档引用。
- DS-3 WHEN 该课堂没有可用知识库，THE SYSTEM SHALL 仍可讨论，且不展示伪造的文档引用。

## 系统不变量

- 讨论不得引用其他课堂的文档。
- 已保存的讨论在重新进入后仍可查看。

## 非功能约束

- 讨论失败时给出可理解的原因并允许再次提问。
- 失败信息不得泄露模型密钥或内部堆栈。

## 关系

- 硬能力依赖：[[features/确认大纲并生成首屏/spec]]
- 治理约束：[[intent]]、[[adr-002-primary-storage]]、[[adr-003-external-service-boundary]]
- 相关：[[features/文档入库/spec]]、[[features/课堂播放与测验/spec]]、[[features/配置模型/spec]]
