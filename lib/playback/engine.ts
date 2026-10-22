import type { Scene } from '@/lib/types/scene';
import type { Action } from '@/lib/types/action';
import type { EngineMode, PlaybackEngineCallbacks, TriggerEvent } from './types';
import { ActionEngine } from '@/lib/action/engine';
import { createLogger } from '@/lib/logger';

const log = createLogger('PlaybackEngine');

/** Ordered playback for one scene, with reading time and discussion prompts. */
export class PlaybackEngine {
  private actionIndex = 0;
  private mode: EngineMode = 'idle';
  private currentTrigger: TriggerEvent | null = null;
  private pendingTrigger: TriggerEvent | null = null;
  private triggerDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private triggerDelayStart = 0;
  private triggerDelayRemaining = 0;
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private speechTimerStart = 0;
  private speechTimerRemaining = 0;

  constructor(
    private scene: Scene,
    private actionEngine: ActionEngine,
    private callbacks: PlaybackEngineCallbacks = {},
  ) {}

  getMode(): EngineMode {
    return this.mode;
  }

  start(): void {
    if (this.mode !== 'idle') {
      log.warn('Cannot start: not idle, current mode:', this.mode);
      return;
    }
    this.actionIndex = 0;
    this.actionEngine.clearEffects();
    this.setMode('playing');
    this.processNext();
  }

  continuePlayback(): void {
    if (this.mode !== 'idle') return;
    this.setMode('playing');
    this.processNext();
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    if (this.triggerDelayTimer) {
      this.triggerDelayRemaining = Math.max(
        0,
        this.triggerDelayRemaining - (Date.now() - this.triggerDelayStart),
      );
      clearTimeout(this.triggerDelayTimer);
      this.triggerDelayTimer = null;
    }
    if (this.speechTimer) {
      this.speechTimerRemaining = Math.max(
        0,
        this.speechTimerRemaining - (Date.now() - this.speechTimerStart),
      );
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
    this.setMode('paused');
  }

  resume(): void {
    if (this.mode !== 'paused' || this.currentTrigger) return;
    this.setMode('playing');
    if (this.pendingTrigger) this.scheduleDiscussionTrigger();
    else if (this.speechTimerRemaining > 0) this.scheduleReadingTimer();
    else this.processNext();
  }

  stop(): void {
    this.setMode('idle');
    if (this.triggerDelayTimer) clearTimeout(this.triggerDelayTimer);
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.triggerDelayTimer = null;
    this.speechTimer = null;
    this.triggerDelayRemaining = 0;
    this.speechTimerRemaining = 0;
    this.pendingTrigger = null;
    this.currentTrigger = null;
    this.actionIndex = 0;
    this.actionEngine.clearEffects();
  }

  /** Continue after the user has read the saved topic and prompt. */
  skipDiscussion(): void {
    if (!this.currentTrigger) return;
    this.currentTrigger = null;
    this.callbacks.onProactiveHide?.();
    this.setMode('playing');
    this.processNext();
  }

  private setMode(mode: EngineMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.callbacks.onModeChange?.(mode);
  }

  private scheduleReadingTimer(): void {
    this.speechTimerStart = Date.now();
    this.speechTimer = setTimeout(() => {
      this.speechTimer = null;
      this.speechTimerRemaining = 0;
      this.callbacks.onSpeechEnd?.();
      if (this.mode === 'playing') this.processNext();
    }, this.speechTimerRemaining);
  }

  private scheduleDiscussionTrigger(): void {
    this.triggerDelayStart = Date.now();
    this.triggerDelayTimer = setTimeout(() => {
      this.triggerDelayTimer = null;
      this.triggerDelayRemaining = 0;
      if (this.mode !== 'playing' || !this.pendingTrigger) return;
      this.currentTrigger = this.pendingTrigger;
      this.pendingTrigger = null;
      this.setMode('paused');
      this.callbacks.onProactiveShow?.(this.currentTrigger);
    }, this.triggerDelayRemaining);
  }

  private processNext(): void {
    if (this.mode !== 'playing') return;
    if (this.actionIndex === 0) {
      this.actionEngine.clearEffects();
      this.callbacks.onSceneChange?.(this.scene.id);
    }

    const action: Action | undefined = this.scene.actions[this.actionIndex];
    if (!action) {
      this.actionEngine.clearEffects();
      this.setMode('idle');
      this.callbacks.onComplete?.();
      return;
    }
    this.actionIndex++;

    switch (action.type) {
      case 'speech': {
        this.callbacks.onSpeechStart?.(action.text);
        // Retain the source reading estimate: CJK 150ms/character,
        // other text 240ms/word, with a 2-second minimum.
        const cjkCount = (
          action.text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []
        ).length;
        const isCJK = cjkCount > action.text.length * 0.3;
        this.speechTimerRemaining = isCJK
          ? Math.max(2000, action.text.length * 150)
          : Math.max(2000, action.text.split(/\s+/).filter(Boolean).length * 240);
        this.scheduleReadingTimer();
        break;
      }
      case 'discussion':
        this.pendingTrigger = { id: action.id, question: action.topic, prompt: action.prompt };
        this.triggerDelayRemaining = 3000;
        this.scheduleDiscussionTrigger();
        break;
      default: {
        const result = this.actionEngine.execute(action);
        if (result.status === 'unavailable') {
          this.callbacks.onActionUnavailable?.(action, result.message);
        } else if (action.type === 'spotlight' || action.type === 'laser') {
          this.callbacks.onEffectFire?.({ kind: action.type, targetId: action.elementId });
        }
        // Keep visual actions ordered without recursive stack growth.
        queueMicrotask(() => this.processNext());
        break;
      }
    }
  }
}
