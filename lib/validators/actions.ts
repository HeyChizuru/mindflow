import type { Action } from "@/lib/types/action";
import { z } from "zod";

const nonBlank = z.string().refine((value) => value.trim().length > 0, "不能为空");
const actionBaseSchema = z.object({
  id: nonBlank,
  title: z.string().optional(),
});

export const actionSchema = z.discriminatedUnion("type", [
  actionBaseSchema.extend({ type: z.literal("speech"), text: nonBlank }).catchall(z.json()),
  actionBaseSchema.extend({ type: z.literal("spotlight"), elementId: nonBlank }).catchall(z.json()),
  actionBaseSchema.extend({ type: z.literal("laser"), elementId: nonBlank }).catchall(z.json()),
  actionBaseSchema.extend({ type: z.literal("discussion"), topic: nonBlank, prompt: nonBlank }).catchall(z.json()),
  actionBaseSchema.extend({ type: z.literal("widget_highlight"), target: nonBlank }).catchall(z.json()),
  actionBaseSchema.extend({
    type: z.literal("widget_setState"),
    state: z.record(z.string(), z.json()).refine((state) => Object.keys(state).length > 0, "组件状态不能为空"),
  }).catchall(z.json()),
  actionBaseSchema.extend({ type: z.literal("widget_annotation"), target: nonBlank, content: nonBlank.optional() }).catchall(z.json()),
]) satisfies z.ZodType<Action>;

export const actionsSchema = z.array(actionSchema).min(1).superRefine((actions, context) => {
  if (new Set(actions.map((action) => action.id)).size !== actions.length) {
    context.addIssue({ code: "custom", message: "动作 ID 不能重复" });
  }
  if (!actions.some((action) => action.type === "speech")) {
    context.addIssue({ code: "custom", message: "场景必须包含讲稿" });
  }
});

/** Keep saved-scene reads compatible while rejecting retired actions on new output/writes. */
export const generatedActionSchema = actionSchema.refine((action) => action.type !== "discussion", {
  message: "不再支持生成讨论动作",
});
export const generatedActionsSchema = actionsSchema.superRefine((actions, context) => {
  actions.forEach((action, index) => {
    if (action.type === "discussion") {
      context.addIssue({ code: "custom", path: [index], message: "新场景不能包含讨论动作" });
    }
  });
});
