import { useCanvasStore } from '@/lib/store/canvas';
import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/scene';

type TeachingAction = Exclude<Action, SpeechAction | DiscussionAction>;
export type ActionExecutionResult = { status: 'applied' } | { status: 'unavailable'; message: string };
const EFFECT_AUTO_CLEAR_MS = 5000;

/** Temporary presentation state only; never changes saved content or answers. */
export class ActionEngine {
  private effects: TeachingAction[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = 0;
  private remaining = 0;
  constructor(private onChange?: (effects: TeachingAction[]) => void, private scene?: Scene) {}

  execute(action: TeachingAction): ActionExecutionResult {
    const target = 'elementId' in action ? action.elementId : 'target' in action ? action.target : null;
    const targets = this.scene?.content.type === 'slide' ? this.scene.content.canvas.elements.map((item) => item.id)
      : this.scene?.content.type === 'quiz' ? this.scene.content.questions.map((item) => item.id) : null;
    if (target && targets && !targets.includes(target)) return { status: 'unavailable', message: '教学动作未找到对应内容，已继续讲解。' };
    if (action.type === 'widget_setState') {
      const state = action.state;
      if (![state.message, state.text, state.status].some((value) => typeof value === 'string')
        && !(typeof state.step === 'number' && Number.isFinite(state.step))) {
        return { status: 'unavailable', message: '此教学状态暂无法展示，已继续讲解。' };
      }
    }
    if (action.type === 'spotlight') useCanvasStore.getState().setSpotlight(action.elementId, { dimness: 0.5 });
    if (action.type === 'laser') useCanvasStore.getState().setLaser(action.elementId);
    const category = (item: TeachingAction) => item.type + ('target' in item ? ':' + item.target : '');
    this.effects = [...this.effects.filter((item) => category(item) !== category(action)), action];
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
  dispose(): void { this.cancelTimer(); }
  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
