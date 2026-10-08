---
feature_id: 创建课堂
artifact: spec
title: 创建课堂
spec_status: accepted
delivery_status: planned
requires: []
governed_by: [intent, adr-001-deployment-shape, adr-002-primary-storage, adr-003-external-service-boundary]
related_to: [文档入库, 流式大纲与手改]
supersedes: []
acceptance: [CC-1, CC-2, CC-3, CC-4]
---

# 创建课堂

## 承诺

用户在首页提交后，系统持久化一节课并进入该课的生成预览。输入是一层 `requirements`，另加可选 PDF：

```json
{
  "requirements": {
    "requirement": "必填",
    "userNickname": "可选",
    "userBio": "可选"
  }
}
```

`requirement` 去掉空白后不少于 10 字、不超过 10000 字。`userNickname` 与 `userBio` 可省略；空白视为未填。创建本身不调用模型。

## 非目标

- 不解析 PDF、不向量化、不把知识库标为就绪（属于文档入库）。
- 不生成大纲、不进入播放或讨论。
- 不调用模型，也不要求事先配置模型。
- 不登录、不接受 ZIP / PPTX。
- 建课输入不含 `interactiveMode`。
- 首页历史列表暂不在本单元。已创建的课堂通过持有课堂 id 刷新或再次打开来恢复。

## 验收

- CC-1 WHEN 用户提交合法 `requirements.requirement` 且无 PDF，THE SYSTEM SHALL 持久化课堂、回显同一份 `requirements`，并进入生成预览；此次不调用模型。
- CC-2 WHEN `requirements` 含非空 `userNickname` 和/或 `userBio`，THE SYSTEM SHALL 与提示词一并持久化；刷新或凭课堂 id 再次打开后仍能读回同一份 `requirements`。两者都为空时不编造学习者画像。
- CC-3 WHEN 用户附带合法 PDF（类型为 PDF、非空、不超过 50MB），THE SYSTEM SHALL 保存原件与元数据并进入生成预览；知识库尚未就绪，不解析、不向量化。
- CC-4 WHEN 提示词缺失或不足 10 字、`requirements` 无法解析，或 PDF 非 PDF、为空、超过 50MB，THE SYSTEM SHALL 拒绝创建，展示可理解的错误并允许重试，且不留下半成品课堂。

## 系统不变量

- 没有合格提示词不得建课。只上传 PDF 不能代替提示词。
- 提示词、昵称、背景分别落在课堂根实体上。不把 `requirements` 整包存成一列 JSON。
- 无登录。持有该课堂 id 即可访问该课堂。
- 昵称与背景都未填时，不写入学习者画像。

## 非功能约束

- 失败信息须可理解，不得包含堆栈或密钥。

## 关系

- 治理约束：[[intent]]、[[adr-001-deployment-shape]]、[[adr-002-primary-storage]]、[[adr-003-external-service-boundary]]
- 相关：[[文档入库]]、[[流式大纲与手改]]。入库与大纲生成不在本单元内。
