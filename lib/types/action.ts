export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

type ActionBase = {
  id: string;
  title?: string;
};

export type SpeechAction = ActionBase & {
  type: "speech";
  text: string;
};

export type SpotlightAction = ActionBase & {
  type: "spotlight";
  elementId: string;
};

export type LaserAction = ActionBase & {
  type: "laser";
  elementId: string;
};

export type DiscussionAction = ActionBase & {
  type: "discussion";
  topic: string;
  prompt: string;
};

export type WidgetHighlightAction = ActionBase & {
  type: "widget_highlight";
  target: string;
};

export type WidgetSetStateAction = ActionBase & {
  type: "widget_setState";
  state: JsonObject;
};

export type WidgetAnnotationAction = ActionBase & {
  type: "widget_annotation";
  target: string;
  content?: string;
};

export type Action =
  | SpeechAction
  | SpotlightAction
  | LaserAction
  | DiscussionAction
  | WidgetHighlightAction
  | WidgetSetStateAction
  | WidgetAnnotationAction;

export type ActionType = Action["type"];

export const SLIDE_ONLY_ACTIONS: readonly ActionType[] = ["spotlight", "laser"];
