import { useCanvasStore } from '@/lib/store/canvas';
import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';

type TeachingAction = Exclude<Action, SpeechAction | DiscussionAction>;

export type ActionExecutionResult =
  | { status: 'applied' }
  | { status: 'unavailable'; message: string };

const EFFECT_AUTO_CLEAR_MS = 5000;

/** Executes temporary teaching effects without editing saved scene content. */
export class ActionEngine {
  private effectTimer: ReturnType<typeof setTimeout> | null = null;

  execute(action: TeachingAction): ActionExecutionResult {
    switch (action.type) {
      case 'spotlight':
        useCanvasStore.getState().setSpotlight(action.elementId, { dimness: 0.5 });
        this.scheduleEffectClear();
        return { status: 'applied' };
      case 'laser':
        useCanvasStore.getState().setLaser(action.elementId);
        this.scheduleEffectClear();
        return { status: 'applied' };
      case 'widget_highlight':
        return { status: 'unavailable', message: '组件高亮尚未接入，已继续讲解。' };
      case 'widget_setState':
        return { status: 'unavailable', message: '组件状态提示尚未接入，已继续讲解。' };
      case 'widget_annotation':
        return { status: 'unavailable', message: '组件标注尚未接入，已继续讲解。' };
      default:
        return { status: 'unavailable', message: '暂不支持此教学动作，已继续讲解。' };
    }
  }

  clearEffects(): void {
    this.dispose();
    useCanvasStore.getState().clearAllEffects();
  }

  dispose(): void {
    if (this.effectTimer) clearTimeout(this.effectTimer);
    this.effectTimer = null;
  }

  private scheduleEffectClear(): void {
    this.dispose();
    this.effectTimer = setTimeout(() => {
      useCanvasStore.getState().clearAllEffects();
      this.effectTimer = null;
    }, EFFECT_AUTO_CLEAR_MS);
  }
}
