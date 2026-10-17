import type { SceneOutline } from "@/lib/types/outline";

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
    }
);
