/** Complete structured model output becomes ordered, validated MindFlow actions. */
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { Action } from '@/lib/types/action';
import { SLIDE_ONLY_ACTIONS } from '@/lib/types/action';
import { actionSchema, actionsSchema } from '@/lib/validators/actions';
import { SceneGenerationError } from './scene-generation-error';
import { tryParseJson } from './json-repair';

const nonBlank = z.string().refine((value) => !!value.trim());
const identityFields = { action_id: nonBlank.optional(), tool_id: nonBlank.optional() };
const structuredItemSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), content: nonBlank, ...identityFields }),
  z.strictObject({
    type: z.literal('action'),
    name: nonBlank.optional(),
    tool_name: nonBlank.optional(),
    params: z.record(z.string(), z.json()).optional(),
    parameters: z.record(z.string(), z.json()).optional(),
    ...identityFields,
  }),
]).superRefine((item, context) => {
  if (item.action_id && item.tool_id && item.action_id !== item.tool_id) {
    context.addIssue({ code: 'custom', message: '动作 ID 不一致' });
  }
  if (item.type === 'action') {
    if (Boolean(item.name) === Boolean(item.tool_name) || (item.params && item.parameters)) {
      context.addIssue({ code: 'custom', message: '动作名称或参数格式不明确' });
    }
  }
});

function invalidActions(): never {
  throw new SceneGenerationError('场景动作输出无效或不完整，请重试', 502);
}

/** Supports name/params and legacy tool_name/parameters; never discards invalid items. */
export function parseActionsFromStructuredOutput(
  response: string,
  sceneType?: string,
  allowedActions?: string[],
): Action[] {
  const cleaned = response.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();
  if (!cleaned.startsWith('[') || !cleaned.endsWith(']')) invalidActions();
  const items = tryParseJson<unknown>(cleaned);
  if (!Array.isArray(items)) invalidActions();
  const actions: Action[] = [];
  for (const raw of items) {
    const parsedItem = structuredItemSchema.safeParse(raw);
    if (!parsedItem.success) invalidActions();
    const item = parsedItem.data;
    const id = item.action_id ?? item.tool_id ?? `action_${nanoid(8)}`;
    let candidate: unknown;
    if (item.type === 'text') {
      candidate = { id, type: 'speech', text: item.content.trim() };
    } else {
      const params = item.params ?? item.parameters ?? {};
      // Identity belongs to the wrapper, and cannot be replaced by model parameters.
      if (Object.hasOwn(params, 'id') || Object.hasOwn(params, 'type')) invalidActions();
      candidate = { ...params, id, type: item.name ?? item.tool_name };
    }
    const parsedAction = actionSchema.safeParse(candidate);
    if (!parsedAction.success) invalidActions();
    const action = parsedAction.data;
    if (sceneType && sceneType !== 'slide' && SLIDE_ONLY_ACTIONS.includes(action.type)) invalidActions();
    if (allowedActions && allowedActions.length > 0 && action.type !== 'speech' && !allowedActions.includes(action.type)) {
      invalidActions();
    }
    actions.push(action);
  }
  const result = actionsSchema.safeParse(actions);
  if (!result.success) invalidActions();
  return result.data;
}
