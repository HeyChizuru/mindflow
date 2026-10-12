"use client";

/** MVP 中文文案，替代开源 i18n（阶段 A 静态页） */
const MESSAGES: Record<string, string> = {
  "upload.requirementRequired": "请填写课程需求",
  "upload.requirementPlaceholder": "描述你想学的课程，例如：用 20 分钟入门 Python 列表与字典",
  "upload.generateFailed": "提交失败，请稍后重试",
  "upload.fileTooLarge": "PDF 不能超过 50MB",
  "upload.pdfSizeLimit": "支持 PDF，最大 50MB",
  "toolbar.pdfUpload": "点击或拖拽上传 PDF",
  "toolbar.removePdf": "移除 PDF",
  "home.slogan": "用提示词生成可播放的互动课程",
  "toolbar.enterClassroom": "开始生成",
  "settings.themeOptions.light": "浅色",
  "settings.themeOptions.dark": "深色",
  "settings.themeOptions.system": "跟随系统",
  "profile.defaultNickname": "学习者",
  "profile.bioPlaceholder": "学习背景（可选，例如年级、基础）",
  "profile.editTooltip": "编辑昵称与背景",
  "profile.uploadAvatar": "上传头像",
  "profile.fileTooLarge": "图片不能超过 5MB",
  "profile.invalidFileType": "请上传图片文件",
};

export function useI18n() {
  const t = (key: string, params?: { name?: string }) => {
    if (key === "home.greetingWithName" && params?.name) {
      return `你好，${params.name}`;
    }
    return MESSAGES[key] ?? key;
  };
  return { t };
}
