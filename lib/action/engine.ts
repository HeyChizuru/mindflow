/**
 * ActionEngine — Unified execution layer for all agent actions.
 *
 * Replaces the 28 Vercel AI SDK tools in ai-tools.ts with a single engine
 * that both online (streaming) and offline (playback) paths share.
 *
 * Visual effects dispatch immediately; speech and widget actions can await completion.
 */
/**
* ActionEngine —— 所有代理动作的统一执行层。
*
* 用一个引擎替代 ai-tools.ts 中的 28 个 Vercel AI SDK 工具，
* 这个引擎同时支持在线（流式）和离线（回放）两种路径。
*
* 视觉效果立即派发；语音和小部件动作可等待完成。
*/

import { useCanvasStore } from '@/lib/store/canvas';
import type { AudioPlayer } from '@/lib/utils/audio-player';
import type {
  Action,
  SpotlightAction,
  LaserAction,
  SpeechAction,
  WidgetHighlightAction,
  WidgetSetStateAction,
  WidgetAnnotationAction,
  WidgetRevealAction,
} from '@/lib/types/action';
import { createLogger } from '@/lib/logger';

const log = createLogger('ActionEngine');

// ==================== Helpers ====================
/** 简单的延迟函数（用于异步操作） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== ActionEngine ====================

/** Default duration (ms) before fire-and-forget effects auto-clear */
/** 即发即忘效果自动清除的默认持续时间（毫秒） */
const EFFECT_AUTO_CLEAR_MS = 5000;

/** Callback for sending messages to widget iframe */
/** 发送消息到小部件 iframe 的回调函数 */
export type WidgetMessageCallback = (type: string, payload: Record<string, unknown>) => void;

export class ActionEngine {
  private audioPlayer: AudioPlayer | null;
  private effectTimer: ReturnType<typeof setTimeout> | null = null;
  private widgetMessageCallback: WidgetMessageCallback | null = null;

  constructor(
    audioPlayer?: AudioPlayer | null,
    widgetMessageCallback?: WidgetMessageCallback | null,
  ) {
    this.audioPlayer = audioPlayer ?? null;
    this.widgetMessageCallback = widgetMessageCallback ?? null;
  }

  /** Set callback for sending messages to widget iframe */
  /** 设置发送消息到小部件 iframe 的回调函数 */
  setWidgetMessageCallback(callback: WidgetMessageCallback | null): void {
    this.widgetMessageCallback = callback;
  }

  /** Clean up timers when the engine is no longer needed */
  /** 当引擎不再需要时，清理定时器 */
  dispose(): void {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
  }

  /**
   * Execute a single action.
   * Fire-and-forget actions return immediately.
   * Synchronous actions return a Promise that resolves when the action is complete.
   */
  /** 执行单个动作。
   * 即发即忘动作立即返回。
   * 同步动作返回一个 Promise，在动作完成时解析。
   */
  async execute(action: Action): Promise<void> {
    switch (action.type) {
      // Fire-and-forget actions
      /** 即发即忘动作 */
      case 'spotlight':
        this.executeSpotlight(action);
        return;
      case 'laser':
        this.executeLaser(action);
        return;
      // Synchronous — Speech
      /** 同步语音播放动作 */
      case 'speech':
        return this.executeSpeech(action);
      case 'discussion':
        // Discussion lifecycle is managed externally via engine callbacks
        /** 讨论生命周期由外部引擎回调管理 */
        return;

      // Widget actions — post message to iframe
      /** 小部件操作 —— 向 iframe 发送消息 */
      case 'widget_highlight':
        return this.executeWidgetHighlight(action as WidgetHighlightAction);
      case 'widget_setState':
        return this.executeWidgetSetState(action as WidgetSetStateAction);
      case 'widget_annotation':
        return this.executeWidgetAnnotation(action as WidgetAnnotationAction);
      case 'widget_reveal':
        return this.executeWidgetReveal(action as WidgetRevealAction);
    }
  }

  /** Clear all active visual effects */
  /** 清除所有活动的视觉效果 */
  clearEffects(): void {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
    useCanvasStore.getState().clearAllEffects();
  }

  /** Schedule auto-clear for fire-and-forget effects */
  /** 为即发即忘效果计划自动清除 */
  private scheduleEffectClear(): void {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
    }
    this.effectTimer = setTimeout(() => {
      useCanvasStore.getState().clearAllEffects();
      this.effectTimer = null;
    }, EFFECT_AUTO_CLEAR_MS);
  }

  // ==================== Fire-and-forget ====================
  /** 即发即忘动作 */
  private executeSpotlight(action: SpotlightAction): void {
    useCanvasStore.getState().setSpotlight(action.elementId, {
      dimness: action.dimOpacity ?? 0.5,
    });
    this.scheduleEffectClear();
  }

  private executeLaser(action: LaserAction): void {
    useCanvasStore.getState().setLaser(action.elementId, {
      color: action.color ?? '#ff0000',
    });
    this.scheduleEffectClear();
  }

  // ==================== Synchronous — Speech ====================
  /** 同步语音播放动作 */
  private async executeSpeech(action: SpeechAction): Promise<void> {
    if (!this.audioPlayer) return;

    return new Promise<void>((resolve) => {
      this.audioPlayer!.onEnded(() => resolve());
      this.audioPlayer!.play(action.audioId || '', action.audioUrl)
        .then((audioStarted) => {
          if (!audioStarted) resolve();
        })
        .catch(() => resolve());
    });
  }

  // ==================== Widget Actions ====================

  /** Send message to widget iframe */
  /** 发送消息到小部件 iframe */
  private sendWidgetMessage(type: string, payload: Record<string, unknown>): void {
    if (this.widgetMessageCallback) {
      this.widgetMessageCallback(type, payload);
    } else {
      log.warn(`Widget message callback not set, cannot send: ${type}`);
    }
  }

  /** Execute widget highlight action (quick visual change) */

  private async executeWidgetHighlight(action: WidgetHighlightAction): Promise<void> {
    this.sendWidgetMessage('HIGHLIGHT_ELEMENT', {
      target: action.target,
    });
    // Quick delay for visual effect
    /** 快速延迟以显示视觉效果 */
    await delay(300);
  }

  /** Execute widget setState action */
  /** 执行小部件 setState 操作 */
  private async executeWidgetSetState(action: WidgetSetStateAction): Promise<void> {
    this.sendWidgetMessage('SET_WIDGET_STATE', { state: action.state });
    // Quick delay for state change to propagate
    /** 快速延迟以确保状态变化传播 */
    await delay(300);
  }

  /** Execute widget annotation action */
  /** 执行小部件 annotation 操作 */
  private async executeWidgetAnnotation(action: WidgetAnnotationAction): Promise<void> {
    this.sendWidgetMessage('ANNOTATE_ELEMENT', {
      target: action.target,
    });
    await delay(300);
  }

  /** Execute widget reveal action */
  /** 执行小部件 reveal 操作 */
  private async executeWidgetReveal(action: WidgetRevealAction): Promise<void> {
    this.sendWidgetMessage('REVEAL_ELEMENT', { target: action.target });
    await delay(300);
  }
}
