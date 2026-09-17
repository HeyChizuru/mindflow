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

/** POST /api/stages 请求体（JSON 或 multipart 的文本字段） */
export type CreateStageBody = {
  requirement?: string;
};

/** 上传 PDF 后返回的文档摘要（尚未 ingest） */
export type CreateStageDocument = {
  id: string;
  filename: string;
  storagePath: string;
};

/** POST /api/stages 成功响应（201） */
export type CreateStageResponse = {
  id: string;
  name: string;
  requirement: string;
  status: "draft";
  previewPhase: "preparing";
  createdAt: string;
  hasKnowledgeBase: false;
  document?: CreateStageDocument;
};

/** API 错误响应体 */
export type ApiErrorResponse = {
  error: string;
};

/** DELETE /api/stages/[id] 成功响应（200） */
export type DeleteStageResponse = {
  id: string;
};
