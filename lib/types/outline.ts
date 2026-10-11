/** 测验难度 */
export type QuizDifficulty = "easy" | "medium" | "hard";

/** 测验题型 */
export type QuizQuestionType = "single" | "multiple" | "short_answer";

/** 大纲生成时 quiz 场景的配置 */
export type QuizConfig = {
  questionCount: number;
  difficulty: QuizDifficulty;
  questionTypes: QuizQuestionType[];
};

/** 幻灯片场景大纲 */
export type SlideSceneOutline = {
  id: string;
  type: "slide";
  title: string;
  description: string;
  keyPoints: string[];
  order: number;
  teachingObjective?: string;
  estimatedDuration?: number;
  languageNote?: string;
};

/** 测验场景大纲 */
export type QuizSceneOutline = {
  id: string;
  type: "quiz";
  title: string;
  description: string;
  keyPoints: string[];
  order: number;
  quizConfig: QuizConfig;
  teachingObjective?: string;
  estimatedDuration?: number;
  languageNote?: string;
};

/** 流式大纲中的单条场景（MindFlow 仅 slide / quiz） */
export type SceneOutline = SlideSceneOutline | QuizSceneOutline;

/** 模型未返回 languageDirective 时的 SSE 兜底文案（不写库） */
export const DEFAULT_LANGUAGE_DIRECTIVE =
  "按用户课程需求所使用的语言进行全程授课；专业术语按该语言的通行习惯处理。";
