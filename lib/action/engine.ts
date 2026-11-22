import { useCanvasStore } from '@/lib/store/canvas';
import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/scene';

type TeachingAction = Exclude<Action, SpeechAction | DiscussionAction>;

export type ActionExecutionResult = { status: 'applied' } | { status: 'unavailable'; message: string };

const EFFECT_AUTO_CLEAR_MS = 5000;

function effectCategory(item: TeachingAction): string {
  return item.type + ('target' in item ? ':' + item.target : '');
}

function actionTargetId(action: TeachingAction): string | null {
  return 'elementId' in action ? action.elementId : 'target' in action ? action.target : null;
}

/** 当前场景下可被动作引用的 id 列表；无场景或非 slide/quiz 时为 null。 */
function sceneTargetIds(scene: Scene | undefined): string[] | null {
  if (scene?.content.type === 'slide') return scene.content.canvas.elements.map((item) => item.id);
  if (scene?.content.type === 'quiz') return scene.content.questions.map((item) => item.id);
  return null;
}

/**
 * 播放期教学动作执行器：聚光灯/激光等写入 canvas store，其余效果保留在内存列表。
 * 不修改已保存的场景内容与作答，仅影响当前画面。
 */
export class ActionEngine {
  private effects: TeachingAction[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = 0;
  private remaining = 0;

  constructor(
    private onChange?: (effects: TeachingAction[]) => void,
    private scene?: Scene,
  ) {}

  /** 执行单条动作；目标不存在或 widget 状态不可展示时返回 unavailable。 */
  execute(action: TeachingAction): ActionExecutionResult {
    const target = actionTargetId(action);
    const targets = sceneTargetIds(this.scene);
    if (target && targets && !targets.includes(target)) {
      return { status: 'unavailable', message: '教学动作未找到对应内容，已继续讲解。' };
    }
    if (action.type === 'widget_setState') {
      const state = action.state;
      if (![state.message, state.text, state.status].some((value) => typeof value === 'string')
        && !(typeof state.step === 'number' && Number.isFinite(state.step))) {
        return { status: 'unavailable', message: '此教学状态暂无法展示，已继续讲解。' };
      }
    }

    if (action.type === 'spotlight') useCanvasStore.getState().setSpotlight(action.elementId, { dimness: 0.5 });
    if (action.type === 'laser') useCanvasStore.getState().setLaser(action.elementId);

    const category = effectCategory(action);
    this.effects = [...this.effects.filter((item) => effectCategory(item) !== category), action];
    this.onChange?.(this.effects);
    this.cancelTimer();
    this.remaining = EFFECT_AUTO_CLEAR_MS;
    this.resumeEffects();
    return { status: 'applied' };
  }

  pauseEffects(): void {
    if (this.timer) this.remaining = Math.max(0, this.remaining - (Date.now() - this.started));
    this.cancelTimer();
  }

  resumeEffects(): void {
    if (this.timer || !this.effects.length) return;
    this.started = Date.now();
    this.timer = setTimeout(() => this.clearEffects(), this.remaining);
  }

  clearEffects(): void {
    this.cancelTimer();
    this.remaining = 0;
    this.effects = [];
    useCanvasStore.getState().clearAllEffects();
    this.onChange?.([]);
  }

  dispose(): void {
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}