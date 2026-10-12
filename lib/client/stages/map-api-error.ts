/** 将 POST /api/stages 常见英文 error 映射为首页中文提示 */
const API_ERROR_ZH: Record<string, string> = {
  "requirement must be at least 10 characters": "课程需求至少 10 个字",
  "requirement must not exceed 10000 characters": "课程需求不能超过 10000 个字",
  "pdf must be a PDF file": "请上传 PDF 文件",
  "pdf must not be empty": "PDF 文件不能为空",
  "pdf must not exceed 50MB": "PDF 不能超过 50MB",
  "pdf must be a file": "请上传 PDF 文件",
  "requirements is required": "请填写课程需求",
  "Invalid JSON body": "请求格式无效，请重试",
  "Validation failed": "输入不符合要求，请检查后重试",
  "Content-Type must be application/json or multipart/form-data": "请求格式无效，请重试",
  "Failed to create stage": "提交失败，请稍后重试",
};

/**
 * 将 API 返回的 `error` 字段转为用户可读中文；未知文案原样返回（仍应为短句）。
 */
export function mapCreateStageApiError(error: string): string {
  const trimmed = error.trim();
  return API_ERROR_ZH[trimmed] ?? trimmed;
}
