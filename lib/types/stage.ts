/** 课堂整体生成状态（stage.status） */
export const STAGE_STATUSES = [
  "draft",
  "ingesting",
  "outline_generating",
  "outline_ready",
  "plan_frozen",
  "outline_reviewing",
  "outline_confirmed",
  "scene_generating",
  "ready",
  "outline_generation_failed",
  "error",
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

/** 生成预览页阶段（stage.previewPhase） */
export const PREVIEW_PHASES = [
  "preparing",
  "outline-ready",
  "review",
  "generating-content",
] as const;

export type PreviewPhase = (typeof PREVIEW_PHASES)[number];

/** 执行稿大纲生命周期（stage.outlinesStatus） */
export const OUTLINES_STATUSES = [
  "draft",
  "confirmed",
  "scenes_ready",
  "archived",
] as const;

export type OutlinesStatus = (typeof OUTLINES_STATUSES)[number];

/** 建课输入里的课程需求与可选学习者信息（规范化后空白字段省略） */
export type StageRequirements = {
  requirement: string;
  userNickname?: string;
  userBio?: string;
};

/** POST /api/stages 请求体。JSON 本体，或 multipart 字段 requirements 解析后的对象 */
export type CreateStageBody = {
  requirements: StageRequirements;
};

/** 上传 PDF 后返回的文档摘要（尚未 ingest，不含全文） */
export type CreateStageDocument = {
  id: string;
  filename: string;
  storagePath: string;
};

/**
 * 创建与按 id 读取的课堂 DTO。
 * 创建时 status 为 draft、previewPhase 为 preparing、hasKnowledgeBase 为 false。
 */
export type StageResponse = {
  id: string;
  name: string;
  requirements: StageRequirements;
  status: StageStatus;
  previewPhase: PreviewPhase;
  createdAt: string;
  hasKnowledgeBase: boolean;
  document?: CreateStageDocument;
};

/** POST /api/stages 成功响应（201） */
export type CreateStageResponse = StageResponse;

/** API 错误响应体 */
export type ApiErrorResponse = {
  error: string;
};

/** DELETE /api/stages/[id] 成功响应（200） */
export type DeleteStageResponse = {
  id: string;
};
