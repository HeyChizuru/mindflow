---
feature_id: 配置模型
artifact: spec
title: 配置模型
spec_status: draft
delivery_status: planned
requires: []
governed_by: [intent, adr-003-external-service-boundary]
related_to: [文档入库, 流式大纲与手改, 课堂讨论]
supersedes: []
acceptance: [CM-1, CM-2, CM-3]
---

# 配置模型

## 承诺

用户可以在顶栏保存模型连接。之后需要模型的操作使用这份配置。创建课堂本身不依赖是否已配置模型。

## 非目标

不创建课堂，不解析文档，不生成大纲。不做多厂商大型设置面板，也不在服务端保存用户的密钥库。

## 验收

- CM-1 WHEN 用户保存完整的模型配置，THE SYSTEM SHALL 在后续需要模型的操作中使用该配置。
- CM-2 WHEN 需要模型的操作缺少配置，THE SYSTEM SHALL 拒绝该次调用并说明原因。
- CM-3 WHEN 用户再次打开设置，THE SYSTEM SHALL 仍能看到已保存的配置。

## 系统不变量

- 未配置模型时，仍允许创建课堂。
- 不使用服务端环境变量兜底用户的模型密钥。

## 非功能约束

- 失败信息不得展示完整密钥。

## 关系

- 治理约束：[[intent]]、[[adr-003-external-service-boundary]]
- 相关：[[features/文档入库/spec]]、[[features/流式大纲与手改/spec]]、[[features/课堂讨论/spec]]
