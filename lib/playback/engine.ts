import type { Scene } from '@/lib/types/scene';
import type { Action } from '@/lib/types/action';
import type { EngineMode, PlaybackEngineCallbacks } from './types';
import { ActionEngine } from '@/lib/action/engine';
import { createLogger } from '@/lib/logger';

const log = createLogger('PlaybackEngine');

/** 单场景按序播放；遗留的 discussion 动作会被跳过。 */
export class PlaybackEngine {
  private actionIndex = 0;
  private mode: EngineMode = 'idle';
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
    if (this.speechTimer) {
      this.speechTimerRemaining = Math.max(
        0,
        this.speechTimerRemaining - (Date.now() - this.speechTimerStart),
      );
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
    this.actionEngine.pauseEffects();
    this.setMode('paused');
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.setMode('playing');
    this.actionEngine.resumeEffects();
    if (this.speechTimerRemaining > 0) this.scheduleReadingTimer();
    else this.processNext();
  }

  stop(): void {
    this.setMode('idle');
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.speechTimer = null;
    this.speechTimerRemaining = 0;
    this.actionIndex = 0;
    this.actionEngine.clearEffects();
  }

  /** 跳过当前阅读等待；其间已排队的教学动作仍会按序执行。 */
  nextSegment(): void {
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.speechTimer = null;
    this.speechTimerRemaining = 0;
    this.callbacks.onSpeechEnd?.();
    this.actionEngine.resumeEffects();
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

  // 逐个消费场景动作；讲稿等待阅读计时，视觉动作执行后继续推进。
  private processNext(): void {
    if (this.mode !== 'playing') return;
    if (this.actionIndex === 0) {
      this.actionEngine.clearEffects();
      this.callbacks.onSceneChange?.(this.scene.id);
    }

    let action: Action | undefined = this.scene.actions[this.actionIndex];
    // 用循环跳过 discussion，避免递归定时器/回调导致旧场景无法播放或栈过深。
    while (action?.type === 'discussion') {
      this.actionIndex++;
      action = this.scene.actions[this.actionIndex];
    }
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
        // 阅读时长估算：CJK 约 150ms/字，其他文本约 240ms/词，最短 2 秒。
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
      default: {
        const result = this.actionEngine.execute(action);
        if (result.status === 'unavailable') {
          this.callbacks.onActionUnavailable?.(action, result.message);
        } else if (action.type === 'spotlight' || action.type === 'laser') {
          this.callbacks.onEffectFire?.({ kind: action.type, targetId: action.elementId });
        }
        // 视觉类动作用 microtask 串行推进，避免同步递归撑爆调用栈。
        queueMicrotask(() => this.processNext());
        break;
      }
    }
  }
}
