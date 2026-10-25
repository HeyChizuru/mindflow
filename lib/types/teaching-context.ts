import type { QuizAnswer, QuizGradeResult, QuizSubmissionStatus } from "@/lib/types/classroom";
import type { StageRequirements } from "@/lib/types/stage";

export type TeachingContextTarget = { stageId: string } & (
  | { sceneId: string; outlineId?: never }
  | { outlineId: string; sceneId?: never }
);

export type TeachingSlideElement = { id: string } & (
  | { type: "text"; text: string }
  | { type: "latex"; latex: string }
  | { type: "shape"; text?: string }
  | { type: "image" | "video" | "line" }
  | { type: "chart"; chartType: string; data: {
      labels: string[]; legends: string[]; series: number[][];
    } | null }
);

export type TeachingSubmission = {
  status: QuizSubmissionStatus;
  answer: QuizAnswer;
  result: QuizGradeResult | null;
};

export type TeachingQuestion = {
  id: string;
  question: string;
  points: number;
  submission: TeachingSubmission | null;
} & (
  | { type: "single" | "multiple"; options: { value: string; label: string }[] }
  | { type: "short_answer" }
);

/** Explicit read projection: never a complete saved Scene or classroom response. */
export type TeachingContext = {
  course: {
    id: string;
    name: string;
    requirements: StageRequirements;
    languageDirective: string | null;
    hasKnowledgeBase: boolean;
    outlines: {
      id: string; type: "slide" | "quiz"; title: string; description: string;
      keyPoints: string[]; order: number; ready: boolean; sceneId: string | null;
    }[];
  };
  scene: { id: string; outlineId: string; title: string; order: number } & (
    | { type: "slide"; elements: TeachingSlideElement[]; speech: string[] }
    | { type: "quiz"; questions: TeachingQuestion[] }
  );
};
