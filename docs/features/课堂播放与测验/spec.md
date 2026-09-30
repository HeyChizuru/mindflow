---
feature_id: 课堂播放与测验
artifact: spec
title: 课堂播放与测验
spec_status: draft
delivery_status: planned
requires: [确认大纲并生成首屏]
governed_by: [intent, adr-002-primary-storage, adr-004-code-dependency-direction]
related_to: []
supersedes: []
acceptance: [PC-1, PC-2, PC-3]
---

# 课堂播放与测验

## 承诺

用户可以按讲稿文本观看幻灯片或测验的字幕推进，并完成简答批改。播放不依赖语音。

## 非目标

不做语音合成或语音识别，不编辑幻灯片，不生成其余场景，不进行多 Agent 讨论。

## 验收

- PC-1 WHEN 用户播放已生成场景，THE SYSTEM SHALL 按讲稿文本展示字幕并推进幻灯片或测验。
- PC-2 WHEN 用户提交简答，THE SYSTEM SHALL 给出批改结果。
- PC-3 WHEN 用户刷新后再次进入该课堂，THE SYSTEM SHALL 仍能播放已生成的场景。

## 系统不变量

- 没有可播放场景时，不得显示已完成的讲稿播放。
- 播放只使用已生成的场景内容，不在播放过程中改写大纲。

## 非功能约束

- 批改失败时给出可理解的原因并允许再次提交。
- 失败信息不得泄露模型密钥或内部堆栈。

## 关系

- 硬能力依赖：[[features/确认大纲并生成首屏/spec]]
- 治理约束：[[intent]]、[[adr-002-primary-storage]]、[[adr-004-code-dependency-direction]]
