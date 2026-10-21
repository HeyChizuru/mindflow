'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useI18n } from '@/lib/hooks/use-i18n';
import { SceneSidebar } from '@/components/stage/scene-sidebar';
import { Header } from '@/components/header';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { Roundtable } from '@/components/roundtable';
import { PlaybackEngine, computePlaybackView } from '@/lib/playback';
import type { EngineMode, TriggerEvent, Effect } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import { useDiscussionTTS } from '@/lib/hooks/use-discussion-tts';
import { useWidgetIframeStore } from '@/lib/store/widget-iframe';
import type { AudioIndicatorState } from '@/components/roundtable/audio-indicator';
import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
import { cn } from '@/lib/utils';
// Playback state persistence removed — refresh always starts from the beginning
// 播放状态持久化已移除 — 刷新后始终从头开始
import { ChatArea, type ChatAreaRef } from '@/components/chat/chat-area';
import { agentsToParticipants, useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { VisuallyHidden } from 'radix-ui';

/**
 * Imperative handle exposed via `ref` so the parent (`Stage`) can tear
 * down playback state synchronously before flipping mode to `'edit'`.
 * Unmount cleanup would run anyway, but the toggle needs to `await`
 * `endActiveSession()` (which aborts SSE) before we trust the engine /
 * chat to be quiescent — fire-and-forget on unmount loses that guarantee.
 *
 * 通过 `ref` 暴露的命令式句柄，供父组件（`Stage`）在切换为 `'edit'` 模式前
 * 同步拆除播放状态。卸载时虽会清理，但切换须 `await` `endActiveSession()`（中止 SSE）
 * 才能确保引擎 / 聊天静默 — 卸载时 fire-and-forget 无法保证这一点。
 */
export interface PlaybackChromeRootHandle {
  /** Ends any active SSE session, stops the engine, cleans up TTS audio. */
  /** 结束活跃 SSE 会话、停止引擎、清理 TTS 音频。 */
  teardown: () => Promise<void>;
}

interface PlaybackChromeRootProps {
  readonly onRetryOutline?: (outlineId: string) => Promise<void>;
  /** Whether the Pro Switch in Header should be enabled. */
  /** Header 中 Pro Switch 是否应启用。 */
  readonly canEnterProMode?: boolean;
  /** Pro Switch click handler — parent coordinates editLock + teardown. */
  /** Pro Switch 点击处理器 — 父组件协调 editLock 与 teardown。 */
  readonly onEnterProMode?: () => void;
}

/**
 * PlaybackChromeRoot — owns the entire playback/autonomous chrome and
 * its state. Mounted whenever `mode !== 'edit'`. The Pro Switch in
 * `Header` calls `onEnterProMode`; the parent `Stage` is responsible
 * for calling `ref.teardown()` before unmounting this root so SSE and
 * the engine wind down cleanly.
 *
 * PlaybackChromeRoot — 拥有整个播放 / 自主 chrome 及其状态。
 * 在 `mode !== 'edit'` 时挂载。`Header` 中的 Pro Switch 调用 `onEnterProMode`；
 * 父组件 `Stage` 负责在卸载本根组件前调用 `ref.teardown()`，使 SSE 与引擎干净收尾。
 */
export const PlaybackChromeRoot = forwardRef<PlaybackChromeRootHandle, PlaybackChromeRootProps>(
  function PlaybackChromeRoot({ onRetryOutline, canEnterProMode, onEnterProMode }, ref) {
    // 自定义组件不能绑定ref，需要使用forwardRef
    const { t } = useI18n();
    const {
      mode,
      getCurrentScene,
      scenes,
      currentSceneId,
      setCurrentSceneId,
      generatingOutlines,
      outlines,
    } = useStageStore();
    const failedOutlines = useStageStore.use.failedOutlines();

    const currentScene = getCurrentScene();

    // Layout state from settings store (persisted via localStorage)
    // 来自 settings store 的布局状态（通过 localStorage 持久化）
    const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
    const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);
    const chatAreaWidth = useSettingsStore((s) => s.chatAreaWidth);
    const setChatAreaWidth = useSettingsStore((s) => s.setChatAreaWidth);
    const chatAreaCollapsed = useSettingsStore((s) => s.chatAreaCollapsed);
    const setChatAreaCollapsed = useSettingsStore((s) => s.setChatAreaCollapsed);
    const setTTSMuted = useSettingsStore((s) => s.setTTSMuted);
    const setTTSVolume = useSettingsStore((s) => s.setTTSVolume);

    // PlaybackEngine state
    // PlaybackEngine 状态
    const [engineMode, setEngineMode] = useState<EngineMode>('idle');
    const [playbackCompleted, setPlaybackCompleted] = useState(false); // Distinguishes "never played" idle from "finished" idle
    // 区分「从未播放」的 idle 与「已播完」的 idle
    const [lectureSpeech, setLectureSpeech] = useState<string | null>(null); // From PlaybackEngine (lecture)
    // 来自 PlaybackEngine（讲授）
    const [liveSpeech, setLiveSpeech] = useState<string | null>(null); // From buffer (discussion/QA)
    // 来自 buffer（讨论 / 问答）
    const [speechProgress, setSpeechProgress] = useState<number | null>(null); // StreamBuffer reveal progress (0–1)
    // StreamBuffer 揭示进度（0–1）
    const [discussionTrigger, setDiscussionTrigger] = useState<TriggerEvent | null>(null);

    // Speaking agent tracking (Issue 2)
    // 发言 agent 追踪（Issue 2）
    const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);

    // Thinking state (Issue 5)
    // 思考状态（Issue 5）
    const [thinkingState, setThinkingState] = useState<{
      stage: string;
      agentId?: string;
    } | null>(null);

    // Cue user state (Issue 7)
    // 提示用户状态（Issue 7）
    const [isCueUser, setIsCueUser] = useState(false);

    // End flash state (Issue 3)
    // 结束闪烁状态（Issue 3）
    const [showEndFlash, setShowEndFlash] = useState(false);
    const [endFlashSessionType, setEndFlashSessionType] = useState<'qa' | 'discussion'>(
      'discussion',
    );

    // Streaming state for stop button (Issue 1)
    // 停止按钮的流式状态（Issue 1）
    const [chatIsStreaming, setChatIsStreaming] = useState(false);
    const [chatSessionType, setChatSessionType] = useState<string | null>(null);

    // Topic pending state: session is soft-paused, bubble stays visible, waiting for user input
    // 话题待定状态：会话软暂停，气泡保持可见，等待用户输入
    const [isTopicPending, setIsTopicPending] = useState(false);

    // Active bubble ID for playback highlight in chat area (Issue 8)
    // 聊天区播放高亮的活跃气泡 ID（Issue 8）
    const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);

    // Scene switch confirmation dialog state
    // 场景切换确认对话框状态
    const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);
    const [isPresenting, setIsPresenting] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isPresentationInteractionActive, setIsPresentationInteractionActive] = useState(false);

    // Whiteboard state (from canvas store so AI tools can open it)
    // 白板状态（来自 canvas store，供 AI 工具打开）
    const whiteboardOpen = useCanvasStore.use.whiteboardOpen();
    const setWhiteboardOpen = useCanvasStore.use.setWhiteboardOpen();

    // Selected agents from settings store (Zustand)
    // 来自 settings store 的已选 agent（Zustand）
    const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
    const ttsMuted = useSettingsStore((s) => s.ttsMuted);
    const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);

    // Generate participants from selected agents
    // 根据已选 agent 生成参与者
    const participants = useMemo(
      () => agentsToParticipants(selectedAgentIds, t),
      [selectedAgentIds, t],
    );

    // Resolved AgentConfig array for hooks that need full agent objects
    // Subscribe to the agents record so voiceConfig changes trigger re-resolution
    // 为需要完整 agent 对象的 hooks 解析 AgentConfig 数组
    // 订阅 agents 记录，使 voiceConfig 变更触发重新解析
    const agentsRecord = useAgentRegistry((s) => s.agents);
    const selectedAgents = useMemo(
      () =>
        selectedAgentIds.map((id) => agentsRecord[id]).filter((a): a is AgentConfig => a != null),
      [agentsRecord, selectedAgentIds],
    );

    // Discussion TTS: audio indicator state
    // 讨论 TTS：音频指示器状态
    const [audioIndicatorState, setAudioIndicatorState] = useState<AudioIndicatorState>('idle');
    const [audioAgentId, setAudioAgentId] = useState<string | null>(null);

    const discussionTTS = useDiscussionTTS({
      enabled: ttsEnabled && !ttsMuted,
      agents: selectedAgents,
      onAudioStateChange: (agentId, state) => {
        setAudioAgentId(agentId);
        setAudioIndicatorState(state);
      },
    });

    // Pick a student agent for discussion trigger (prioritize student > non-teacher > fallback)
    // 为讨论触发选择学生 agent（优先 student > 非 teacher > 回退）
    const pickStudentAgent = useCallback((): string => {
      const registry = useAgentRegistry.getState();
      const agents = selectedAgentIds
        .map((id) => registry.getAgent(id))
        .filter((a): a is AgentConfig => a != null);
      const students = agents.filter((a) => a.role === 'student');
      if (students.length > 0) {
        return students[Math.floor(Math.random() * students.length)].id;
      }
      const nonTeachers = agents.filter((a) => a.role !== 'teacher');
      if (nonTeachers.length > 0) {
        return nonTeachers[Math.floor(Math.random() * nonTeachers.length)].id;
      }
      return agents[0]?.id || 'default-1';
    }, [selectedAgentIds]);

    const engineRef = useRef<PlaybackEngine | null>(null);
    const audioPlayerRef = useRef(createAudioPlayer());
    const chatAreaRef = useRef<ChatAreaRef>(null);
    const lectureSessionIdRef = useRef<string | null>(null);
    const lectureActionCounterRef = useRef(0);
    const discussionAbortRef = useRef<AbortController | null>(null);
    const presentationIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    // Guard to prevent double flash when manual stop triggers onDiscussionEnd
    // 防止手动停止触发 onDiscussionEnd 时双重闪烁
    const manualStopRef = useRef(false);
    // Monotonic counter incremented on each scene switch — used to discard stale SSE callbacks
    // 每次场景切换递增的单调计数器 — 用于丢弃过期的 SSE 回调
    const sceneEpochRef = useRef(0);
    // When true, the next engine init will auto-start playback (for auto-play scene advance)
    // 为 true 时，下次引擎初始化将自动开始播放（用于自动播放场景前进）
    const autoStartRef = useRef(false);
    // Discussion buffer-level pause state (distinct from soft-pause which aborts SSE)
    // 讨论 buffer 级暂停状态（区别于中止 SSE 的软暂停）
    const [isDiscussionPaused, setIsDiscussionPaused] = useState(false);

    /**
     * Resume a soft-paused topic: re-call /chat with existing session messages.
     * The director picks the next agent to continue.
     *
     * 恢复软暂停的话题：用现有会话消息重新调用 /chat。
     * 导演选择下一个 agent 继续。
     */
    const doResumeTopic = useCallback(async () => {
      // Clear old bubble immediately — no lingering on interrupted text
      // 立即清除旧气泡 — 不在中断文本上残留
      setIsTopicPending(false);
      setLiveSpeech(null);
      setSpeakingAgentId(null);
      setThinkingState({ stage: 'director' });
      setChatIsStreaming(true);
      // Transition engine back to live — onInputActivate paused it when soft-pausing,
      // so we must explicitly resume to keep engine mode in sync with the chat loop.
      // 将引擎切回 live — onInputActivate 在软暂停时已暂停，须显式 resume 以与聊天循环同步。
      engineRef.current?.resume();
      // Fire new chat round — SSE events will drive thinking → agent_start → speech
      // 发起新一轮聊天 — SSE 事件驱动 thinking → agent_start → speech
      await chatAreaRef.current?.resumeActiveSession();
    }, []);

    /** Reset all live/discussion state (shared by doSessionCleanup & onDiscussionEnd) */
    /** 重置所有 live / 讨论状态（doSessionCleanup 与 onDiscussionEnd 共用） */
    const resetLiveState = useCallback(() => {
      setLiveSpeech(null);
      setSpeakingAgentId(null);
      setSpeechProgress(null);
      setThinkingState(null);
      setIsCueUser(false);
      setIsTopicPending(false);
      setChatIsStreaming(false);
      setChatSessionType(null);
      setIsDiscussionPaused(false);
    }, []);

    /** Full scene reset (scene switch) — resetLiveState + lecture/visual state */
    /** 完整场景重置（场景切换）— resetLiveState + 讲授 / 视觉状态 */
    const resetSceneState = useCallback(() => {
      resetLiveState();
      setPlaybackCompleted(false);
      setLectureSpeech(null);
      setSpeechProgress(null);
      setShowEndFlash(false);
      setActiveBubbleId(null);
      setDiscussionTrigger(null);
    }, [resetLiveState]);

    /** Request failure should exit live discussion UI without hard-closing the session. */
    /** 请求失败时应退出 live 讨论 UI，但不硬关闭会话。 */
    const handleLiveSessionError = useCallback(() => {
      engineRef.current?.handleDiscussionError();
      resetLiveState();
      setActiveBubbleId(null);
    }, [resetLiveState]);

    /**
     * Unified session cleanup — called by both roundtable stop button and chat area end button.
     * Handles: engine transition, flash, roundtable state clearing.
     *
     * 统一会话清理 — 圆桌停止按钮与聊天区结束按钮均调用。
     * 处理：引擎过渡、闪烁、圆桌状态清除。
     */
    const doSessionCleanup = useCallback(() => {
      const activeType = chatSessionType;

      // Engine cleanup — guard to avoid double flash from onDiscussionEnd
      // 引擎清理 — 防止 onDiscussionEnd 导致双重闪烁
      manualStopRef.current = true;
      engineRef.current?.handleEndDiscussion();
      manualStopRef.current = false;

      // Show end flash with correct session type
      // 以正确的会话类型显示结束闪烁
      if (activeType === 'qa' || activeType === 'discussion') {
        setEndFlashSessionType(activeType);
        setShowEndFlash(true);
        setTimeout(() => setShowEndFlash(false), 1800);
      }

      // Stop any in-flight discussion TTS audio
      // 停止进行中的讨论 TTS 音频
      discussionTTS.cleanup();

      resetLiveState();
    }, [chatSessionType, resetLiveState, discussionTTS]);

    // Shared stop-discussion handler (used by both Roundtable and Canvas toolbar)
    // 共享停止讨论处理器（Roundtable 与 Canvas 工具栏共用）
    const handleStopDiscussion = useCallback(async () => {
      await chatAreaRef.current?.endActiveSession();
      doSessionCleanup();
    }, [doSessionCleanup]);

    // Imperative teardown so the parent can `await` SSE / engine / TTS
    // shutdown before flipping mode to 'edit'. Mirrors what the old in-
    // component `handleToggleEditMode` did, but exposed through ref so
    // the toggle lives one layer up.
    // 命令式 teardown，供父组件在切换为 'edit' 前 `await` SSE / 引擎 / TTS 关闭。
    // 镜像原组件内 `handleToggleEditMode` 行为，通过 ref 暴露，切换逻辑上移一层。
    useImperativeHandle(
      ref,//让父组件能调用子组件里的 teardown()
      () => ({//返回一个对象，包含 teardown 方法
        teardown: async () => {
          await chatAreaRef.current?.endActiveSession();
          if (discussionAbortRef.current) {
            discussionAbortRef.current.abort();
            discussionAbortRef.current = null;
          }
          engineRef.current?.stop();
          discussionTTS.cleanup();
          resetSceneState();
        },
      }),
      [discussionTTS, resetSceneState],
    );

    const clearPresentationIdleTimer = useCallback(() => {
      if (presentationIdleTimerRef.current) {
        clearTimeout(presentationIdleTimerRef.current);
        presentationIdleTimerRef.current = null;
      }
    }, []);

    const resetPresentationIdleTimer = useCallback(() => {
      setControlsVisible(true);
      clearPresentationIdleTimer();
      if (isPresenting && !isPresentationInteractionActive) {
        presentationIdleTimerRef.current = setTimeout(() => {
          setControlsVisible(false);
        }, 3000);
      }
    }, [clearPresentationIdleTimer, isPresenting, isPresentationInteractionActive]);

    const togglePresentation = useCallback(async () => {
      const stageElement = stageRef.current;
      if (!stageElement) return;

      try {
        if (document.fullscreenElement === stageElement) {
          // Unlock Escape key before exiting fullscreen
          // 退出全屏前解锁 Escape 键
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (navigator as any).keyboard?.unlock?.();
          await document.exitFullscreen();
          return;
        }

        setControlsVisible(true);
        await stageElement.requestFullscreen();
        // Lock Escape key so it doesn't auto-exit fullscreen (#255)
        // Escape is handled manually in our keydown handler instead
        // 锁定 Escape 键，防止自动退出全屏（#255）
        // Escape 改由我们的 keydown 处理器手动处理
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).keyboard?.lock?.(['Escape']).catch(() => { });
        setSidebarCollapsed(true);
        setChatAreaCollapsed(true);
      } catch {
        // Firefox may deny fullscreen from certain keyboard events (e.g. F11)
        // Firefox 可能拒绝某些键盘事件（如 F11）触发的全屏
        console.warn('[Presentation] Fullscreen request denied — browser policy');
      }
    }, [setChatAreaCollapsed, setSidebarCollapsed]);

    useEffect(() => {
      const onFullscreenChange = () => {
        const active = document.fullscreenElement === stageRef.current;
        setIsPresenting(active);

        if (!active) {
          // Ensure keyboard unlock on any fullscreen exit
          // 任何全屏退出时确保键盘解锁
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (navigator as any).keyboard?.unlock?.();
          setControlsVisible(true);
          clearPresentationIdleTimer();
        }
      };

      document.addEventListener('fullscreenchange', onFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, [clearPresentationIdleTimer]);

    useEffect(() => {
      if (!isPresenting) {
        setControlsVisible(true);
        clearPresentationIdleTimer();
        return;
      }

      const handleActivity = () => {
        resetPresentationIdleTimer();
      };

      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('mousedown', handleActivity);
      window.addEventListener('touchstart', handleActivity);
      if (isPresentationInteractionActive) {
        setControlsVisible(true);
        clearPresentationIdleTimer();
      } else {
        resetPresentationIdleTimer();
      }

      return () => {
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('mousedown', handleActivity);
        window.removeEventListener('touchstart', handleActivity);
        clearPresentationIdleTimer();
      };
    }, [
      clearPresentationIdleTimer,
      isPresenting,
      isPresentationInteractionActive,
      resetPresentationIdleTimer,
    ]);

    // Initialize playback engine when scene changes
    // 场景变化时初始化播放引擎
    useEffect(() => {
      // Bump epoch so any stale SSE callbacks from the previous scene are discarded
      // 递增 epoch，丢弃上一场景的过期 SSE 回调
      sceneEpochRef.current++;

      // End any active QA/discussion session — this synchronously aborts the SSE
      // stream inside use-chat-sessions (abortControllerRef.abort()), preventing
      // stale onLiveSpeech callbacks from leaking into the new scene.
      // 结束活跃 QA / 讨论会话 — 同步中止 use-chat-sessions 内 SSE 流
      //（abortControllerRef.abort()），防止过期 onLiveSpeech 回调泄漏到新场景。
      chatAreaRef.current?.endActiveSession();

      // Also abort the engine-level discussion controller
      // 同时中止引擎级讨论控制器
      if (discussionAbortRef.current) {
        discussionAbortRef.current.abort();
        discussionAbortRef.current = null;
      }

      // Stop any in-flight discussion TTS audio on scene switch
      // 场景切换时停止进行中的讨论 TTS 音频
      discussionTTS.cleanup();

      // Reset all roundtable/live state so scenes are fully isolated
      // 重置所有圆桌 / live 状态，使场景完全隔离
      resetSceneState();

      if (!currentScene || !currentScene.actions || currentScene.actions.length === 0) {
        engineRef.current = null;
        setEngineMode('idle');

        return;
      }

      // Stop previous engine
      // 停止上一引擎
      if (engineRef.current) {
        engineRef.current.stop();
      }

      // Widget iframe messaging callback for interactive scenes, resolved lazily
      // at send time (keyed by sceneId). The interactive iframe now lives in the
      // keep-alive host (#619), which registers its postMessage callback a commit
      // after this engine is built — so resolving eagerly here would capture null
      // on a scene's first visit and silently drop every widget action. Looking it
      // up per-send always sees the live registration.
      // 交互式场景的 widget iframe 消息回调，发送时惰性解析（按 sceneId）。
      // iframe 现位于保活宿主（#619），其 postMessage 回调在本引擎构建后一 commit 才注册 —
      // 此处急切解析会在首次访问时捕获 null 并静默丢弃所有 widget 动作。每次发送时查找总能看到最新注册。
      const sceneIdForWidget = currentScene.id;
      const widgetSendMessage = (type: string, payload: Record<string, unknown>) =>
        useWidgetIframeStore.getState().getSendMessage(sceneIdForWidget)?.(type, payload);

      // Create ActionEngine for playback (with audioPlayer for TTS and widget messaging)
      // 创建播放用 ActionEngine（含 TTS 与 widget 消息的 audioPlayer）
      const actionEngine = new ActionEngine(
        useStageStore,
        audioPlayerRef.current,
        widgetSendMessage,
      );

      // Create new PlaybackEngine
      // 创建新 PlaybackEngine
      const engine = new PlaybackEngine([currentScene], actionEngine, audioPlayerRef.current, {
        onModeChange: (mode) => {
          setEngineMode(mode);
        },
        onSceneChange: (_sceneId) => {
          // Scene change handled by engine
          // 场景切换由引擎处理
        },
        onSpeechStart: (text) => {
          setLectureSpeech(text);
          // Add to lecture session with incrementing index for dedup
          // Chat area pacing is handled by the StreamBuffer (onTextReveal)
          // 以递增索引加入讲授会话以去重
          // 聊天区节奏由 StreamBuffer（onTextReveal）控制
          if (lectureSessionIdRef.current) {
            const idx = lectureActionCounterRef.current++;
            const speechId = `speech-${Date.now()}`;
            chatAreaRef.current?.addLectureMessage(
              lectureSessionIdRef.current,
              { id: speechId, type: 'speech', text } as Action,
              idx,
            );
            // Track active bubble for highlight (Issue 8)
            // 追踪活跃气泡以高亮（Issue 8）
            const msgId = chatAreaRef.current?.getLectureMessageId(lectureSessionIdRef.current!);
            if (msgId) setActiveBubbleId(msgId);
          }
        },
        onSpeechEnd: () => {
          // Don't clear lectureSpeech — let it persist until the next
          // onSpeechStart replaces it or the scene transitions.
          // Clearing here causes fallback to idleText (first sentence).
          // 不清除 lectureSpeech — 保持至下次 onSpeechStart 替换或场景切换。
          // 此处清除会导致回退到 idleText（第一句）。
          setActiveBubbleId(null);
        },
        onEffectFire: (effect: Effect) => {
          // Add to lecture session with incrementing index
          // 以递增索引加入讲授会话
          if (
            lectureSessionIdRef.current &&
            (effect.kind === 'spotlight' || effect.kind === 'laser')
          ) {
            const idx = lectureActionCounterRef.current++;
            chatAreaRef.current?.addLectureMessage(
              lectureSessionIdRef.current,
              {
                id: `${effect.kind}-${Date.now()}`,
                type: effect.kind,
                elementId: effect.targetId,
              } as Action,
              idx,
            );
          }
        },
        onProactiveShow: (trigger) => {
          if (!trigger.agentId) {
            // Mutate in-place so engine.currentTrigger also gets the agentId
            // (confirmDiscussion reads agentId from the same object reference)
            // 原地修改，使 engine.currentTrigger 也获得 agentId
            //（confirmDiscussion 从同一对象引用读取 agentId）
            trigger.agentId = pickStudentAgent();
          }
          setDiscussionTrigger(trigger);
        },
        onProactiveHide: () => {
          setDiscussionTrigger(null);
        },
        onDiscussionConfirmed: (topic, prompt, agentId) => {
          // Start SSE discussion via ChatArea
          // 通过 ChatArea 启动 SSE 讨论
          handleDiscussionSSE(topic, prompt, agentId);
        },
        onDiscussionEnd: () => {
          // Abort any active SSE
          // 中止活跃 SSE
          if (discussionAbortRef.current) {
            discussionAbortRef.current.abort();
            discussionAbortRef.current = null;
          }
          setDiscussionTrigger(null);
          // Stop any in-flight discussion TTS audio
          // 停止进行中的讨论 TTS 音频
          discussionTTS.cleanup();
          // Clear roundtable state (idempotent — may already be cleared by doSessionCleanup)
          // 清除圆桌状态（幂等 — 可能已被 doSessionCleanup 清除）
          resetLiveState();
          // Only show flash for engine-initiated ends (not manual stop — that's handled by doSessionCleanup)
          // 仅对引擎发起的结束显示闪烁（手动停止由 doSessionCleanup 处理）
          if (!manualStopRef.current) {
            setEndFlashSessionType('discussion');
            setShowEndFlash(true);
            setTimeout(() => setShowEndFlash(false), 1800);
          }
          // If all actions are exhausted (discussion was the last action), mark
          // playback as completed so the bubble shows reset instead of play.
          // 若所有动作已耗尽（讨论为最后动作），标记播放完成，气泡显示重置而非播放。
          if (engineRef.current?.isExhausted()) {
            setPlaybackCompleted(true);
          }
        },
        onUserInterrupt: (text) => {
          // User interrupted → start a discussion via chat
          // 用户打断 → 通过聊天发起讨论
          chatAreaRef.current?.sendMessage(text);
        },
        isAgentSelected: (agentId) => {
          const ids = useSettingsStore.getState().selectedAgentIds;
          return ids.includes(agentId);
        },
        getPlaybackSpeed: () => useSettingsStore.getState().playbackSpeed || 1,
        onComplete: () => {
          // lectureSpeech intentionally NOT cleared — last sentence stays visible
          // until scene transition (auto-play) or user restarts. Scene change
          // effect handles the reset.
          // 有意不清除 lectureSpeech — 末句保持可见直至场景切换（自动播放）或用户重启。
          // 场景切换 effect 负责重置。
          setPlaybackCompleted(true);

          // End lecture session on playback complete
          // 播放完成时结束讲授会话
          if (lectureSessionIdRef.current) {
            chatAreaRef.current?.endSession(lectureSessionIdRef.current);
            lectureSessionIdRef.current = null;
          }
          // Auto-play: advance to next scene after a short pause
          // 自动播放：短暂暂停后前进到下一场景
          const { autoPlayLecture } = useSettingsStore.getState();
          if (autoPlayLecture) {
            setTimeout(() => {
              const stageState = useStageStore.getState();
              if (!useSettingsStore.getState().autoPlayLecture) return;
              const allScenes = stageState.scenes;
              const curId = stageState.currentSceneId;
              const idx = allScenes.findIndex((s) => s.id === curId);
              if (idx >= 0 && idx < allScenes.length - 1) {
                const currentScene = allScenes[idx];
                if (
                  currentScene.type === 'quiz' ||
                  currentScene.type === 'interactive' ||
                  currentScene.type === 'pbl'
                ) {
                  return;
                }
                autoStartRef.current = true;
                stageState.setCurrentSceneId(allScenes[idx + 1].id);
              } else if (idx === allScenes.length - 1 && stageState.generatingOutlines.length > 0) {
                // Last scene exhausted but next is still generating — go to pending page
                // 末场景已耗尽但下一幕仍在生成 — 前往待定页
                const currentScene = allScenes[idx];
                if (
                  currentScene.type === 'quiz' ||
                  currentScene.type === 'interactive' ||
                  currentScene.type === 'pbl'
                ) {
                  return;
                }
                autoStartRef.current = true;
                stageState.setCurrentSceneId(PENDING_SCENE_ID);
              }
            }, 1500);
          }
        },
      });

      engineRef.current = engine;

      // Auto-start if triggered by auto-play scene advance
      // 若由自动播放场景前进触发则自动开始
      if (autoStartRef.current) {
        autoStartRef.current = false;
        (async () => {
          if (currentScene && chatAreaRef.current) {
            const sessionId = await chatAreaRef.current.startLecture(currentScene.id);
            lectureSessionIdRef.current = sessionId;
            lectureActionCounterRef.current = 0;
          }
          engine.start();
        })();
      } else {
        // Load saved playback state and restore position (but never auto-play).
        // 加载已保存播放状态并恢复位置（但从不自动播放）。
      }
      // 仅在场景变化时重跑，函数为稳定引用
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when scene changes, functions are stable refs
    }, [currentScene]);

    // Cleanup on unmount
    // 卸载时清理
    useEffect(() => {
      const audioPlayer = audioPlayerRef.current;
      const chatArea = chatAreaRef.current;
      return () => {
        if (engineRef.current) {
          engineRef.current.stop();
        }
        audioPlayer.destroy();
        if (discussionAbortRef.current) {
          discussionAbortRef.current.abort();
        }
        discussionTTS.cleanup();
        chatArea?.endActiveSession();
        clearPresentationIdleTimer();
      };
      // 仅卸载时清理，clearPresentationIdleTimer 为稳定引用
      // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup, clearPresentationIdleTimer is stable
    }, []);

    // Sync mute state from settings store to audioPlayer
    // 将 settings store 静音状态同步到 audioPlayer
    useEffect(() => {
      audioPlayerRef.current.setMuted(ttsMuted);
    }, [ttsMuted]);

    // Sync volume from settings store to audioPlayer
    // 将 settings store 音量同步到 audioPlayer
    const ttsVolume = useSettingsStore((s) => s.ttsVolume);
    useEffect(() => {
      if (!ttsMuted) {
        audioPlayerRef.current.setVolume(ttsVolume);
      }
    }, [ttsVolume, ttsMuted]);

    // Sync playback speed to audio player (for live-updating current audio)
    // 将播放速度同步到音频播放器（实时更新当前音频）
    const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);
    useEffect(() => {
      audioPlayerRef.current.setPlaybackRate(playbackSpeed);
    }, [playbackSpeed]);

    /**
     * Handle discussion SSE — POST /api/chat and push events to engine
     *
     * 处理讨论 SSE — POST /api/chat 并将事件推送给引擎
     */
    const handleDiscussionSSE = useCallback(
      async (topic: string, prompt?: string, agentId?: string) => {
        // Start discussion display in ChatArea (lecture speech is preserved independently)
        // 在 ChatArea 启动讨论显示（讲授语音独立保留）
        chatAreaRef.current?.startDiscussion({
          topic,
          prompt,
          agentId: agentId || 'default-1',
        });
        // Auto-switch to chat tab when discussion starts
        // 讨论开始时自动切换到聊天标签
        chatAreaRef.current?.switchToTab('chat');
        // Immediately mark streaming for synchronized stop button
        // 立即标记流式状态，以同步停止按钮
        setChatIsStreaming(true);
        setChatSessionType('discussion');
        // Optimistic thinking: show thinking dots immediately (same as onMessageSend)
        // 乐观思考：立即显示思考点（与 onMessageSend 相同）
        setThinkingState({ stage: 'director' });
      },
      [],
    );

    // First speech text for idle display (extracted here for playbackView)
    // 空闲显示的首句文本（在此提取供 playbackView 使用）
    const firstSpeechText = useMemo(
      () =>
        currentScene?.actions?.find((a): a is SpeechAction => a.type === 'speech')?.text ?? null,
      [currentScene],
    );

    // Whether the speaking agent is a student (for bubble role derivation)
    // 发言 agent 是否为学生（用于气泡角色推导）
    const speakingStudentFlag = useMemo(() => {
      if (!speakingAgentId) return false;
      const agent = useAgentRegistry.getState().getAgent(speakingAgentId);
      return agent?.role !== 'teacher';
    }, [speakingAgentId]);

    // Centralised derived playback view
    // 集中派生的播放视图
    const playbackView = useMemo(
      () =>
        computePlaybackView({
          engineMode,
          lectureSpeech,
          liveSpeech,
          speakingAgentId,
          thinkingState,
          isCueUser,
          isTopicPending,
          chatIsStreaming,
          discussionTrigger,
          playbackCompleted,
          idleText: firstSpeechText,
          speakingStudent: speakingStudentFlag,
          sessionType: chatSessionType,
        }),
      [
        engineMode,
        lectureSpeech,
        liveSpeech,
        speakingAgentId,
        thinkingState,
        isCueUser,
        isTopicPending,
        chatIsStreaming,
        discussionTrigger,
        playbackCompleted,
        firstSpeechText,
        speakingStudentFlag,
        chatSessionType,
      ],
    );

    const isTopicActive = playbackView.isTopicActive;

    /**
     * Gated scene switch — if a topic is active, show AlertDialog before switching.
     * Returns true if the switch was immediate, false if gated (dialog shown).
     *
     * 门控场景切换 — 若有活跃话题，切换前显示 AlertDialog。
     * 立即切换返回 true，被门控（显示对话框）返回 false。
     */
    const gatedSceneSwitch = useCallback(
      (targetSceneId: string): boolean => {
        if (targetSceneId === currentSceneId) return false;
        if (isTopicActive) {
          setPendingSceneId(targetSceneId);
          return false;
        }
        setCurrentSceneId(targetSceneId);
        return true;
      },
      [currentSceneId, isTopicActive, setCurrentSceneId],
    );

    /** User confirmed scene switch via AlertDialog */
    /** 用户通过 AlertDialog 确认场景切换 */
    const confirmSceneSwitch = useCallback(() => {
      if (!pendingSceneId) return;
      chatAreaRef.current?.endActiveSession();
      doSessionCleanup();
      setCurrentSceneId(pendingSceneId);
      setPendingSceneId(null);
    }, [pendingSceneId, setCurrentSceneId, doSessionCleanup]);

    /** User cancelled scene switch via AlertDialog */
    /** 用户通过 AlertDialog 取消场景切换 */
    const cancelSceneSwitch = useCallback(() => {
      setPendingSceneId(null);
    }, []);

    // play/pause toggle
    // 播放 / 暂停切换
    const handlePlayPause = useCallback(async () => {
      const engine = engineRef.current;
      if (!engine) return;

      const mode = engine.getMode();
      if (mode === 'playing' || mode === 'live') {
        engine.pause();
        // Pause lecture buffer so text stops immediately
        // 暂停讲授 buffer，使文本立即停止
        if (lectureSessionIdRef.current) {
          chatAreaRef.current?.pauseBuffer(lectureSessionIdRef.current);
        }
      } else if (mode === 'paused') {
        engine.resume();
        // Resume lecture buffer
        // 恢复讲授 buffer
        if (lectureSessionIdRef.current) {
          chatAreaRef.current?.resumeBuffer(lectureSessionIdRef.current);
        }
      } else {
        const wasCompleted = playbackCompleted;
        setPlaybackCompleted(false);
        // Starting playback - create/reuse lecture session
        // 开始播放 — 创建 / 复用讲授会话
        if (currentScene && chatAreaRef.current) {
          const sessionId = await chatAreaRef.current.startLecture(currentScene.id);
          lectureSessionIdRef.current = sessionId;
        }
        if (wasCompleted) {
          // Restart from beginning (user clicked restart after completion)
          // 从头重播（用户在完成后点击重启）
          lectureActionCounterRef.current = 0;
          engine.start();
        } else {
          // Continue from current position (e.g. after discussion end)
          // 从当前位置继续（如讨论结束后）
          engine.continuePlayback();
        }
      }
    }, [playbackCompleted, currentScene]);

    // get scene information
    // 获取场景信息
    const isPendingScene = currentSceneId === PENDING_SCENE_ID;
    const hasNextPending = generatingOutlines.length > 0;
    // True when every outline has materialized into a scene and nothing is
    // currently generating — signals the classroom has finished and the user
    // can see a completion page. Comparing scenes.length === outlines.length
    // (rather than just `scenes.length > 0`) means a partial generation with
    // some failed outlines does not falsely trigger completion.
    // 当所有大纲已物化为场景且当前无生成中时 — 表示课堂已完成，用户可见完成页。
    // 比较 scenes.length === outlines.length（而非仅 scenes.length > 0）可避免
    // 部分大纲失败时误触发完成状态。
    const isCourseComplete =
      outlines.length > 0 && scenes.length === outlines.length && generatingOutlines.length === 0;
    const canAdvanceToPendingSlot = hasNextPending || isCourseComplete;

    // previous scene (gated)
    // 上一场景（门控）
    const handlePreviousScene = useCallback(() => {
      if (isPendingScene) {
        // From pending page → go to last real scene
        // 从待定页 → 前往最后一个真实场景
        if (scenes.length > 0) {
          gatedSceneSwitch(scenes[scenes.length - 1].id);
        }
        return;
      }
      const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
      if (currentIndex > 0) {
        gatedSceneSwitch(scenes[currentIndex - 1].id);
      }
    }, [currentSceneId, gatedSceneSwitch, isPendingScene, scenes]);

    // next scene (gated)
    // 下一场景（门控）
    const handleNextScene = useCallback(() => {
      if (isPendingScene) return; // Already on pending, nowhere to go
      // 已在待定页，无处可去
      const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);
      if (currentIndex < scenes.length - 1) {
        gatedSceneSwitch(scenes[currentIndex + 1].id);
      } else if (canAdvanceToPendingSlot) {
        // On last real scene → advance to pending slot (generating or completion page)
        // 在最后一个真实场景 → 前进到待定槽位（生成中或完成页）
        setCurrentSceneId(PENDING_SCENE_ID);
      }
    }, [
      currentSceneId,
      gatedSceneSwitch,
      canAdvanceToPendingSlot,
      isPendingScene,
      scenes,
      setCurrentSceneId,
    ]);

    const currentSceneIndex = isPendingScene
      ? scenes.length
      : scenes.findIndex((s) => s.id === currentSceneId);
    const totalScenesCount = scenes.length + (canAdvanceToPendingSlot ? 1 : 0);

    // get action information
    // 获取动作信息
    const totalActions = currentScene?.actions?.length || 0;

    // whiteboard toggle
    // 白板切换
    const handleWhiteboardToggle = () => {
      setWhiteboardOpen(!whiteboardOpen);
    };

    const isPresentationShortcutTarget = useCallback((target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
        return true;
      }

      return (
        target.closest(
          ['input', 'textarea', 'select', '[role="slider"]', 'input[type="range"]'].join(', '),
        ) !== null
      );
    }, []);

    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return;
        // Let modifier-key combos (Ctrl+C, Ctrl+S, etc.) pass through to the browser
        // 让修饰键组合（Ctrl+C、Ctrl+S 等）传递给浏览器
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (
          isPresentationShortcutTarget(event.target) ||
          isPresentationShortcutTarget(document.activeElement)
        ) {
          return;
        }

        switch (event.key) {
          case 'ArrowLeft':
            if (!isPresenting) return;
            event.preventDefault();
            handlePreviousScene();
            resetPresentationIdleTimer();
            break;
          case 'ArrowRight':
            if (!isPresenting) return;
            event.preventDefault();
            handleNextScene();
            resetPresentationIdleTimer();
            break;
          case ' ':
          case 'Spacebar':
            // During active QA/discussion, Roundtable owns Space for
            // buffer-level pause/resume — don't also fire engine play/pause.
            // 活跃 QA / 讨论期间，Roundtable 拥有 Space 用于 buffer 级暂停 / 恢复 —
            // 不再同时触发引擎播放 / 暂停。
            if (chatSessionType === 'qa' || chatSessionType === 'discussion') break;
            event.preventDefault();
            handlePlayPause();
            break;
          case 'Escape':
            // With keyboard.lock(), Escape no longer auto-exits fullscreen.
            // If panels are open, roundtable handles Escape (close panels).
            // If no panels are open, manually exit fullscreen.
            // keyboard.lock() 后 Escape 不再自动退出全屏。
            // 面板打开时由 roundtable 处理 Escape（关闭面板）。
            // 无面板时手动退出全屏。
            if (isPresenting && !isPresentationInteractionActive) {
              event.preventDefault();
              togglePresentation();
            }
            break;
          case 'ArrowUp':
            event.preventDefault();
            setTTSVolume(ttsVolume + 0.1);
            break;
          case 'ArrowDown':
            event.preventDefault();
            setTTSVolume(ttsVolume - 0.1);
            break;
          case 'm':
          case 'M':
            event.preventDefault();
            setTTSMuted(!ttsMuted);
            break;
          case 's':
          case 'S':
            event.preventDefault();
            setSidebarCollapsed(!sidebarCollapsed);
            break;
          case 'c':
          case 'C':
            event.preventDefault();
            setChatAreaCollapsed(!chatAreaCollapsed);
            break;
          default:
            break;
        }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [
      chatSessionType,
      chatAreaCollapsed,
      handleNextScene,
      handlePlayPause,
      handlePreviousScene,
      isPresenting,
      isPresentationInteractionActive,
      isPresentationShortcutTarget,
      resetPresentationIdleTimer,
      setChatAreaCollapsed,
      setSidebarCollapsed,
      setTTSMuted,
      setTTSVolume,
      sidebarCollapsed,
      togglePresentation,
      ttsMuted,
      ttsVolume,
    ]);

    // Intercept F11 to use our presentation fullscreen instead of browser fullscreen
    // This way ESC can exit fullscreen (browser F11 fullscreen requires F11 to exit)
    // 拦截 F11，使用我们的演示全屏而非浏览器全屏
    // 这样 ESC 可退出全屏（浏览器 F11 全屏需 F11 退出）
    useEffect(() => {
      const onF11 = (event: KeyboardEvent) => {
        if (event.key === 'F11') {
          event.preventDefault();
          togglePresentation();
        }
      };

      window.addEventListener('keydown', onF11);
      return () => window.removeEventListener('keydown', onF11);
    }, [togglePresentation]);

    // Map engine mode to the CanvasArea's expected engine state
    // 将引擎模式映射为 CanvasArea 期望的引擎状态
    const canvasEngineState = (() => {
      switch (engineMode) {
        case 'playing':
        case 'live':
          return 'playing';
        case 'paused':
          return 'paused';
        default:
          return 'idle';
      }
    })();

    // Build discussion request for Roundtable ProactiveCard from trigger
    // 从 trigger 构建 Roundtable ProactiveCard 的讨论请求
    const discussionRequest: DiscussionAction | null = discussionTrigger
      ? {
        type: 'discussion',
        id: discussionTrigger.id,
        topic: discussionTrigger.question,
        prompt: discussionTrigger.prompt,
        agentId: discussionTrigger.agentId || 'default-1',
      }
      : null;

    // Scene viewer height — header is 80px when visible, roundtable is
    // 192px in playback mode (autonomous hides it). Mode is guaranteed
    // non-'edit' here since the parent Stage unmounts this component
    // when entering Pro mode.
    // 场景查看器高度 — header 可见时为 80px，播放模式下 roundtable 为 192px（自主模式隐藏）。
    // 进入 Pro 模式时父 Stage 会卸载本组件，故此处 mode 保证非 'edit'。
    const sceneViewerHeight = (() => {
      const headerHeight = isPresenting ? 0 : 80;
      const roundtableHeight = mode === 'playback' && !isPresenting ? 192 : 0;
      return `calc(100% - ${headerHeight + roundtableHeight}px)`;
    })();

    return (
      <div
        ref={stageRef}
        className={cn(
          'flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-900',
          isPresenting && !controlsVisible && 'cursor-none',
        )}
      >
        <SceneSidebar
          collapsed={sidebarCollapsed}
          onCollapseChange={setSidebarCollapsed}
          onSceneSelect={gatedSceneSwitch}
          onRetryOutline={onRetryOutline}
          isCourseComplete={isCourseComplete}
        />

        {/* Main Content Area */}
        {/* 主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Header — playback only. The Pro Switch fires `onEnterProMode`
            (passed by the parent Stage) which acquires the cross-tab
            edit lock and then awaits our `teardown()` before flipping
            mode to 'edit'.
            Header — 仅播放模式。Pro Switch 触发 `onEnterProMode`
            （由父 Stage 传入），获取跨标签页编辑锁后 await 我们的 `teardown()` 再切换为 'edit'。 */}
          {!isPresenting && (
            <Header
              currentSceneTitle={
                currentScene?.title ||
                (isCourseComplete && isPendingScene ? t('stage.courseComplete') : '')
              }
              mode={mode}
              canEdit={!!canEnterProMode}
              onToggleEditMode={onEnterProMode}
            />
          )}

          {/* Canvas Area — playback-only renderer. The parent Stage swaps
            this whole PlaybackChromeRoot out when entering edit mode, so
            no inline branching is needed here.
            Canvas 区 — 仅播放渲染器。进入编辑模式时父 Stage 整体替换
            PlaybackChromeRoot，故此处无需内联分支。 */}
          <div
            className="overflow-hidden relative flex-1 min-h-0 isolate"
            style={{
              height: sceneViewerHeight,
            }}
            suppressHydrationWarning
          >
            <CanvasArea
              currentScene={currentScene}
              currentSceneIndex={currentSceneIndex}
              scenesCount={totalScenesCount}
              mode={mode}
              engineState={canvasEngineState}
              isLiveSession={
                chatIsStreaming || isTopicPending || engineMode === 'live' || !!chatSessionType
              }
              whiteboardOpen={whiteboardOpen}
              sidebarCollapsed={sidebarCollapsed}
              chatCollapsed={chatAreaCollapsed}
              onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
              onPrevSlide={handlePreviousScene}
              onNextSlide={handleNextScene}
              onPlayPause={handlePlayPause}
              onWhiteboardClose={handleWhiteboardToggle}
              isPresenting={isPresenting}
              onTogglePresentation={togglePresentation}
              showStopDiscussion={
                engineMode === 'live' ||
                (chatIsStreaming && (chatSessionType === 'qa' || chatSessionType === 'discussion'))
              }
              onStopDiscussion={handleStopDiscussion}
              hideToolbar={mode === 'playback' || (isPresenting && !controlsVisible)}
              isPendingScene={isPendingScene}
              isCourseComplete={isCourseComplete}
              isGenerationFailed={
                isPendingScene && failedOutlines.some((f) => f.id === generatingOutlines[0]?.id)
              }
              onRetryGeneration={
                onRetryOutline && generatingOutlines[0]
                  ? () => onRetryOutline(generatingOutlines[0].id)
                  : undefined
              }
            />
          </div>

          {/* Roundtable Area */}
          {/* 圆桌区 */}
          {mode === 'playback' && (
            <div
              className={cn(
                'transition-opacity duration-300',
                !isPresenting && 'shrink-0',
                isPresenting && 'absolute inset-x-0 bottom-0 z-20',
              )}
            >
              <Roundtable
                mode={mode}
                initialParticipants={participants}
                playbackView={playbackView}
                currentSpeech={liveSpeech}
                lectureSpeech={lectureSpeech}
                idleText={firstSpeechText}
                playbackCompleted={playbackCompleted}
                discussionRequest={discussionRequest}
                engineMode={engineMode}
                isStreaming={chatIsStreaming}
                audioIndicatorState={audioIndicatorState}
                audioAgentId={audioAgentId}
                sessionType={
                  chatSessionType === 'qa'
                    ? 'qa'
                    : chatSessionType === 'discussion'
                      ? 'discussion'
                      : undefined
                }
                speakingAgentId={speakingAgentId}
                speechProgress={speechProgress}
                showEndFlash={showEndFlash}
                endFlashSessionType={endFlashSessionType}
                thinkingState={thinkingState}
                isCueUser={isCueUser}
                isTopicPending={isTopicPending}
                onMessageSend={async (msg) => {
                  // Always clear Level-1 pause state — the closure may hold a stale
                  // isDiscussionPaused value (e.g. voice input's onTranscription callback
                  // captures onMessageSend before React re-renders with the updated state).
                  // 始终清除 Level-1 暂停状态 — 闭包可能持有过期的 isDiscussionPaused
                  //（如语音输入 onTranscription 在 React 重渲染前捕获 onMessageSend）。
                  setIsDiscussionPaused(false);
                  // Clear the sticky livePausedRef so the next agent-loop buffer
                  // starts unpaused. (pauseActiveLiveBuffer sets a ref that new
                  // buffers inherit — must be cleared before sendMessage creates one.)
                  // 清除粘性 livePausedRef，使下一 agent 循环 buffer 未暂停启动。
                  //（pauseActiveLiveBuffer 设置的 ref 会被新 buffer 继承 — 须在 sendMessage 创建前清除。）
                  chatAreaRef.current?.resumeActiveLiveBuffer();
                  // Flush any buffered / in-flight TTS audio from the previous
                  // agent turn so it doesn't leak into the next round.
                  // 冲刷上一轮 agent 的缓冲 / 进行中 TTS 音频，防止泄漏到下一轮。
                  discussionTTS.cleanup();
                  // Clear soft-paused state — user is continuing the topic
                  // 清除软暂停状态 — 用户正在继续话题
                  if (isTopicPending) {
                    setIsTopicPending(false);
                    setLiveSpeech(null);
                    setSpeakingAgentId(null);
                  }
                  // User interrupts during playback — handleUserInterrupt triggers
                  // onUserInterrupt callback which already calls sendMessage, so skip
                  // the direct sendMessage below to avoid sending twice.
                  // Include 'paused' because onInputActivate pauses the engine before
                  // the user finishes typing — without this the interrupt position
                  // would never be saved and resuming after QA skips to the next sentence.
                  // 播放中用户打断 — handleUserInterrupt 触发 onUserInterrupt 已调用 sendMessage，
                  // 故跳过下方直接 sendMessage 避免重复发送。
                  // 包含 'paused'：onInputActivate 在用户输入完成前暂停引擎 —
                  // 否则打断位置不会保存，QA 后恢复会跳到下一句。
                  if (
                    engineRef.current &&
                    (engineMode === 'playing' || engineMode === 'live' || engineMode === 'paused')
                  ) {
                    engineRef.current.handleUserInterrupt(msg);
                  } else {
                    chatAreaRef.current?.sendMessage(msg);
                  }
                  // Auto-switch to chat tab when user sends a message
                  // 用户发消息时自动切换到聊天标签
                  chatAreaRef.current?.switchToTab('chat');
                  setIsCueUser(false);
                  // Immediately mark streaming for synchronized stop button
                  // 立即标记流式状态以同步停止按钮
                  setChatIsStreaming(true);
                  setChatSessionType(chatSessionType || 'qa');
                  // Optimistic thinking: show thinking dots immediately so there's
                  // no blank gap between userMessage expiry and the SSE thinking event.
                  // The real SSE event will overwrite this with the same or updated value.
                  // 乐观思考：立即显示思考点，避免 userMessage 过期与 SSE thinking 事件间的空白。
                  // 真实 SSE 事件会以相同或更新值覆盖。
                  setThinkingState({ stage: 'director' });
                }}
                onDiscussionStart={() => {
                  // User clicks "Join" on ProactiveCard
                  // 用户点击 ProactiveCard 上的「加入」
                  engineRef.current?.confirmDiscussion();
                }}
                onDiscussionSkip={() => {
                  // User clicks "Skip" on ProactiveCard
                  // 用户点击 ProactiveCard 上的「跳过」
                  engineRef.current?.skipDiscussion();
                }}
                onStopDiscussion={handleStopDiscussion}
                onInputActivate={() => {
                  // Level-1 pause: freeze buffer tick + TTS audio while SSE keeps buffering.
                  // User resumes manually via Space / pause button after closing the input.
                  // No isDiscussionPaused guard — always attempt to pause the buffer.
                  // The return value ensures UI state stays in sync with buffer state.
                  // Level-1 暂停：冻结 buffer tick + TTS 音频，SSE 继续缓冲。
                  // 用户关闭输入后通过 Space / 暂停按钮手动恢复。
                  // 无 isDiscussionPaused 守卫 — 始终尝试暂停 buffer。
                  // 返回值确保 UI 状态与 buffer 状态同步。
                  if (chatSessionType === 'qa' || chatSessionType === 'discussion') {
                    const paused = chatAreaRef.current?.pauseActiveLiveBuffer();
                    if (paused) {
                      discussionTTS.pause();
                      setIsDiscussionPaused(true);
                    }
                  }
                  // Also pause playback engine
                  // 同时暂停播放引擎
                  if (engineRef.current && (engineMode === 'playing' || engineMode === 'live')) {
                    engineRef.current.pause();
                  }
                }}
                onResumeTopic={doResumeTopic}
                onPlayPause={handlePlayPause}
                isDiscussionPaused={isDiscussionPaused}
                onDiscussionPause={() => {
                  const paused = chatAreaRef.current?.pauseActiveLiveBuffer();
                  if (paused) {
                    discussionTTS.pause();
                    setIsDiscussionPaused(true);
                  }
                }}
                onDiscussionResume={() => {
                  chatAreaRef.current?.resumeActiveLiveBuffer();
                  discussionTTS.resume();
                  setIsDiscussionPaused(false);
                }}
                totalActions={totalActions}
                currentActionIndex={0}
                currentSceneIndex={currentSceneIndex}
                scenesCount={totalScenesCount}
                whiteboardOpen={whiteboardOpen}
                sidebarCollapsed={sidebarCollapsed}
                chatCollapsed={chatAreaCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                onToggleChat={() => setChatAreaCollapsed(!chatAreaCollapsed)}
                onPrevSlide={handlePreviousScene}
                onNextSlide={handleNextScene}
                onWhiteboardClose={handleWhiteboardToggle}
                isPresenting={isPresenting}
                controlsVisible={controlsVisible}
                onTogglePresentation={togglePresentation}
                onPresentationInteractionChange={setIsPresentationInteractionActive}
                fullscreenContainerRef={stageRef}
              />
            </div>
          )}
        </div>

        {/* Chat Area — playback / autonomous always renders it here; Pro
          (edit) mode unmounts this whole PlaybackChromeRoot, so the
          edit branch has no chat.
          聊天区 — 播放 / 自主模式始终在此渲染；Pro（编辑）模式会卸载整个
          PlaybackChromeRoot，故编辑分支无聊天。 */}
        <div className="flex shrink-0">
          <ChatArea
            ref={chatAreaRef}
            width={chatAreaWidth}
            onWidthChange={setChatAreaWidth}
            collapsed={chatAreaCollapsed}
            onCollapseChange={setChatAreaCollapsed}
            activeBubbleId={activeBubbleId}
            onActiveBubble={(id) => setActiveBubbleId(id)}
            currentSceneId={currentSceneId}
            onLiveSpeech={(text, agentId) => {
              // Capture epoch at call time — discard if scene has changed since
              // 调用时捕获 epoch — 若场景已变化则丢弃
              const epoch = sceneEpochRef.current;
              // Use queueMicrotask to let any pending scene-switch reset settle first
              // 使用 queueMicrotask，让待处理的场景切换重置先完成
              queueMicrotask(() => {
                if (sceneEpochRef.current !== epoch) return; // stale — scene changed
                // 过期 — 场景已变化
                setLiveSpeech(text);
                if (agentId !== undefined) {
                  setSpeakingAgentId(agentId);
                }
                if (text !== null || agentId) {
                  setChatIsStreaming(true);
                  setChatSessionType(chatAreaRef.current?.getActiveSessionType?.() ?? null);
                  setIsTopicPending(false);
                } else if (text === null && agentId === null) {
                  setChatIsStreaming(false);
                  // Don't clear chatSessionType here — it's needed by the stop
                  // button when director cues user (cue_user → done → liveSpeech null).
                  // It gets properly cleared in doSessionCleanup and scene change.
                  // 此处不清除 chatSessionType — 导演提示用户时停止按钮需要它
                  //（cue_user → done → liveSpeech null）。
                  // 在 doSessionCleanup 与场景切换时正确清除。
                }
              });
            }}
            onSpeechProgress={(ratio) => {
              const epoch = sceneEpochRef.current;
              queueMicrotask(() => {
                if (sceneEpochRef.current !== epoch) return;
                setSpeechProgress(ratio);
              });
            }}
            onThinking={(state) => {
              const epoch = sceneEpochRef.current;
              queueMicrotask(() => {
                if (sceneEpochRef.current !== epoch) return;
                setThinkingState(state);
              });
            }}
            onCueUser={(_fromAgentId, _prompt) => {
              setIsCueUser(true);
            }}
            onLiveSessionError={handleLiveSessionError}
            onStopSession={doSessionCleanup}
            onSegmentSealed={discussionTTS.handleSegmentSealed}
            shouldHoldAfterReveal={discussionTTS.shouldHold}
          />
        </div>

        {/* Scene switch confirmation dialog */}
        {/* 场景切换确认对话框 */}
        <AlertDialog
          open={!!pendingSceneId}
          onOpenChange={(open) => {
            if (!open) cancelSceneSwitch();
          }}
        >
          <AlertDialogContent
            container={isPresenting ? stageRef.current : undefined}
            className="max-w-sm rounded-2xl p-0 overflow-hidden border-0 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)]"
          >
            <VisuallyHidden.Root>
              <AlertDialogTitle>{t('stage.confirmSwitchTitle')}</AlertDialogTitle>
            </VisuallyHidden.Root>
            {/* Top accent bar */}
            {/* 顶部强调条 */}
            <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />

            <div className="px-6 pt-5 pb-2 flex flex-col items-center text-center">
              {/* Icon */}
              {/* 图标 */}
              <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 ring-1 ring-amber-200/50 dark:ring-amber-700/30">
                <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400" />
              </div>
              {/* Title */}
              {/* 标题 */}
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1.5">
                {t('stage.confirmSwitchTitle')}
              </h3>
              {/* Description */}
              {/* 描述 */}
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {t('stage.confirmSwitchMessage')}
              </p>
            </div>

            <AlertDialogFooter className="px-6 pb-5 pt-3 flex-row gap-3">
              <AlertDialogCancel onClick={cancelSceneSwitch} className="flex-1 rounded-xl">
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmSceneSwitch}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-md shadow-amber-200/50 dark:shadow-amber-900/30"
              >
                {t('common.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);
