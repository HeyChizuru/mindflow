/** PDF 体积上限（50MB），与 M0 / 首页工具栏一致 */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/**
 * 校验用户选择的 PDF。通过返回 null；失败返回 i18n 键（由调用方 `t()`）。
 */
export function validatePdfFile(file: File): string | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return "upload.pdfInvalid";
  }
  if (file.size === 0) {
    return "upload.pdfEmpty";
  }
  if (file.size > MAX_PDF_BYTES) {
    return "upload.fileTooLarge";
  }
  return null;
}
