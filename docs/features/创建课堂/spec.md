---
feature_id: 创建课堂
artifact: spec
title: 创建课堂
spec_status: draft
delivery_status: planned
requires: []
governed_by: [intent, adr-001-deployment-shape, adr-002-primary-storage]
related_to: []
supersedes: []
acceptance: [CS-1, CS-2, CS-3]
---

# 创建课堂

## 承诺

用户填写课程需求后可以创建课堂并进入生成预览。PDF 可选；若上传，创建时只保存附件，不解析正文。首页可以再次打开已创建的课堂。

## 非目标

不在本单元解析或引用 PDF 正文，不生成大纲，不进入播放或讨论。

## 验收

- CS-1 WHEN 用户提交足够长的课程需求，THE SYSTEM SHALL 创建课堂并进入生成预览；若同时提供 PDF，只保存附件而不解析正文。
- CS-2 WHEN 课程需求缺失或过短，THE SYSTEM SHALL 拒绝创建并说明原因。
- CS-3 WHEN 用户从首页历史再次进入，THE SYSTEM SHALL 打开已持久化的课堂。

## 系统不变量

- 没有课程需求就不能创建课堂。
- 已创建课堂在刷新或重新进入后仍可从历史中打开。

## 非功能约束

- 拒绝原因必须能让用户知道该补什么，而不是内部错误码。

## 关系

- 治理约束：[[intent]]、[[adr-001-deployment-shape]]、[[adr-002-primary-storage]]
