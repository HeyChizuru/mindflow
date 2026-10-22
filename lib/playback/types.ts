import type { Action } from '@/lib/types/action';

/** Visual effects emitted by the playback engine. */
export type Effect = { kind: 'spotlight' | 'laser'; targetId: string };

export type EngineMode = 'idle' | 'playing' | 'paused';

/** Saved discussion content displayed while lecture playback waits. */
export interface TriggerEvent {
  id: string;
  question: string;
  prompt: string;
}

export interface PlaybackEngineCallbacks {
  onModeChange?: (mode: EngineMode) => void;
  onSceneChange?: (sceneId: string) => void;
  onSpeechStart?: (text: string) => void;
  onSpeechEnd?: () => void;
  onEffectFire?: (effect: Effect) => void;
  onProactiveShow?: (trigger: TriggerEvent) => void;
  onProactiveHide?: () => void;
  onActionUnavailable?: (action: Action, message: string) => void;
  onComplete?: () => void;
}
