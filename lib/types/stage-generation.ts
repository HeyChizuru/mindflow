import type { SceneOutline } from "@/lib/types/outline";
import type { GeneratedQuizContent, GeneratedSlideContent, Scene } from "@/lib/types/scene";

/** The caller selects the target; both APIs verify these inputs against the saved stage. */
export type SceneContentGenerationBody = {
  stageId: string;
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  requirement: string;
  languageDirective?: string | null;
  userProfile?: string;
};

export type SceneActionsGenerationBody = SceneContentGenerationBody & {
  content: GeneratedSlideContent | GeneratedQuizContent;
  /** Incoming speeches from preceding scenes, in caller-supplied order. */
  previousSpeeches: string[];
};

/** Content is an intermediate result, not a persisted Scene. */
export type SceneContentGenerationResponse = {
  success: true;
  content: GeneratedSlideContent | GeneratedQuizContent;
  effectiveOutline: SceneOutline;
};

export type SceneActionsGenerationResponse = {
  success: true;
  scene: Scene;
  /** Speeches from the returned scene only, for preparing a later request. */
  previousSpeeches: string[];
};

export type ConfirmOutlinesBody = {
  outlines: SceneOutline[];
  languageDirective?: string | null;
  outlineStreamCompleted: true;
};

export type ConfirmOutlinesResponse = {
  stageId: string;
  outlinesStatus: "confirmed";
  outlines: SceneOutline[];
  languageDirective: string | null;
};

export type GenerationPreviewResponse = {
  stageId: string;
  hasKnowledgeBase: boolean;
} & (
  | { outlinesStatus: "draft" }
  | {
      outlinesStatus: "confirmed";
      outlines: SceneOutline[];
      languageDirective: string | null;
      firstScene: Scene | null;
    }
);
