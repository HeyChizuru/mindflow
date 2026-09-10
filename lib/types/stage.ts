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

/** POST /api/stages 请求体 */
export type CreateStageBody = {
  requirement: string;
};

/** POST /api/stages 成功响应（201） */
export type CreateStageResponse = {
  id: string;
  name: string;
  requirement: string;
  status: "draft";
  previewPhase: "preparing";
  createdAt: string;
};

/** API 错误响应体 */
export type ApiErrorResponse = {
  error: string;
};
