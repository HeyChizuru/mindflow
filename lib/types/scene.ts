import type { Action, JsonObject } from "@/lib/types/action";

// 所有元素共享画布坐标；渲染器再根据类型读取各自的展示数据。
type ElementBase = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
};

export type SlideElement = ElementBase & (
  | { type: "text"; content: string; defaultFontName: string; defaultColor: string }
  | { type: "shape"; viewBox: string | [number, number]; path: string; fill: string; fixedRatio: boolean }
  | { type: "image"; src: string; fixedRatio: boolean }
  | { type: "video"; src: string }
  | { type: "chart"; chartType: string; data: JsonObject; themeColors: string[] }
  | { type: "latex"; latex: string; html: string; color: string; fixedRatio: boolean }
  | { type: "line"; start: [number, number]; end: [number, number]; style: string; color: string; points: [string, string] }
);

export type SlideBackground =
  | { type: "solid"; color: string }
  | {
      type: "gradient";
      gradient: {
        type: "linear" | "radial";
        colors: { pos: number; color: string }[];
        rotate: number;
      };
    };

export type SlideTheme = {
  backgroundColor: string;
  themeColors: string[];
  fontColor: string;
  fontName: string;
  outline?: { color: string; width: number; style: string };
  shadow?: { h: number; v: number; blur: number; color: string };
};

// 画布使用固定逻辑尺寸，页面展示时再按容器比例缩放。
export type SlideCanvas = {
  id: string;
  viewportSize: number;
  viewportRatio: number;
  theme: SlideTheme;
  elements: SlideElement[];
  background?: SlideBackground;
};

export type QuizOption = { value: string; label: string };

type QuestionBase = {
  id: string;
  question: string;
  analysis: string;
  points: number;
};

export type QuizQuestion = QuestionBase & (
  | { type: "single" | "multiple"; options: QuizOption[]; answer: string[] }
  | { type: "short_answer"; commentPrompt: string }
);

export type GeneratedSlideContent = {
  elements: SlideElement[];
  background?: SlideBackground;
  remark?: string;
};

export type GeneratedQuizContent = { questions: QuizQuestion[] };

export type SceneContent =
  | { type: "slide"; canvas: SlideCanvas }
  | { type: "quiz"; questions: QuizQuestion[] };

export type CreateSceneInput = {
  stageId: string;
  outlineId: string;
  type: "slide" | "quiz";
  title: string;
  order: number;
  content: SceneContent;
  actions: Action[];
};

export type Scene = CreateSceneInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
