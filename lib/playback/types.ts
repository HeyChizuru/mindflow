import type { Action } from '@/lib/types/action';

/** Visual effects emitted by the playback engine. */
export type Effect = { kind: 'spotlight' | 'laser'; targetId: string };

export type EngineMode = 'idle' | 'playing' | 'paused';

export interface PlaybackEngineCallbacks {
  onModeChange?: (mode: EngineMode) => void;
  onSceneChange?: (sceneId: string) => void;
  onSpeechStart?: (text: string) => void;
  onSpeechEnd?: () => void;
  onEffectFire?: (effect: Effect) => void;
  onActionUnavailable?: (action: Action, message: string) => void;
  onComplete?: () => void;
}
