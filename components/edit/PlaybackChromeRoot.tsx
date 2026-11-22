'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClassroomView } from '@/components/stage/classroom-view';
import type {
  ClassroomNotice,
  PlaybackDisplay,
  QuestionDisplay,
  TeachingEffect,
} from '@/components/stage/classroom-view-types';
import type { ReadyClassroom } from '@/lib/client/classroom';
import type { ClassroomSession, SessionNotice } from '@/lib/client/classroom-session';
import { useClassroom } from '@/lib/hooks/use-classroom';
import { useClassroomChat } from '@/lib/hooks/use-classroom-chat';
import { PlaybackEngine } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';

/** 单次播放运行（场景 + playbackRun）在 UI 上的快照。 */
type PlayingState = {
  sceneId: string;
  run: number;
  phase: PlaybackDisplay;
  subtitle: string | null;
  effects: TeachingEffect[];
  actionNotice: string | null;
};

type PlaybackChromeRootProps = {
  stageId: string;
  chatSelection?: string;
  chatOpen?: boolean;
};

const NARROW_LAYOUT_MQ = '(max-width: 1023px)';
const MOBILE_LAYOUT_MQ = '(max-width: 767px)';

/** 焦点在聊天或可编辑控件上时，不劫持课堂空格与方向键。 */
function shouldIgnoreClassroomKeydown(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest(
      '[data-classroom-chat],input,textarea,select,button,a,[role=radio],[role=checkbox],[contenteditable=true]',
    ),
  );
}

/**
 * 合并课堂会话提示与播放器提示，映射为 ClassroomView 可展示的 notice 列表。
 */
function buildClassroomNotices(
  positionNotice: SessionNotice | null,
  sessionNotice: SessionNotice | null,
  playbackMessage: string | null | undefined,
  session: Pick<ClassroomSession, 'retryPosition' | 'refresh'>,
): ClassroomNotice[] {
  const fromSession = [positionNotice, sessionNotice].flatMap((notice) => notice ? [{
    ...notice,
    actionLabel: notice.action === 'position' ? '读取确认后重试保存' : notice.action === 'read' ? '重新读取' : undefined,
    onAction: notice.action === 'position' ? () => { void session.retryPosition(); }
      : notice.action === 'read' ? () => { void session.refresh(); } : undefined,
  }] : []);

  const fromPlayback = playbackMessage ? [{ title: '播放提示', message: playbackMessage }] : [];

  return [...fromSession, ...fromPlayback];
}

/** 汇总全课堂尚未完成批改的测验题，供侧栏「未批改」入口展示。 */
function collectUngradedQuestions(
  classroom: ReadyClassroom | null | undefined,
  questions: Record<string, QuestionDisplay>,
  questionKey: (sceneId: string, questionId: string) => string,
): { sceneId: string; questionId: string; label: string }[] {
  if (!classroom) return [];

  return classroom.scenes.flatMap((item) => item.content.type === 'quiz' ? item.content.questions.flatMap((question) => {
    const record = questions[questionKey(item.id, question.id)]?.record;
    return record && record.status !== 'completed'
      ? [{ sceneId: item.id, questionId: question.id, label: `${item.title} · ${question.question}` }]
      : [];
  }) : []);
}

/**
 * 编辑态课堂外壳：挂载播放引擎、目录/测验/聊天，并处理全屏与快捷键。
 * 播放与草稿交互留在浏览器侧，与课堂 Session 协同。
 */
export function PlaybackChromeRoot({
  stageId,
  chatSelection,
  chatOpen,
}: PlaybackChromeRootProps) {
  const { session, state } = useClassroom(stageId);
  const { chat, state: chatState, sessions } = useClassroomChat(
    stageId,
    chatSelection,
    chatOpen,
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [playing, setPlaying] = useState<PlayingState | null>(null);

  const engineRef = useRef<PlaybackEngine | null>(null);
  const firstPlayback = useRef(true);
  const stageRef = useRef<HTMLDivElement>(null);

  const data = state.classroom;
  // 发消息时使用课堂当前场景；后续切场不改变已发送问题的归属。
  const scene = data?.scenes.find((item) => item.id === state.sceneId) ?? null;

  // --- 响应式：窄屏打开聊天时收起侧栏 ---
  useEffect(() => {
    const narrow = window.matchMedia(NARROW_LAYOUT_MQ);
    const collapseForChat = () => {
      if (narrow.matches && chat.getSnapshot().open) {
        setSidebarCollapsed(true);
      }
    };
    narrow.addEventListener('change', collapseForChat);
    return () => narrow.removeEventListener('change', collapseForChat);
  }, [chat]);

  // --- 场景 / 重播：独立 PlaybackEngine 生命周期 ---
  useEffect(() => {
    if (!scene) {
      return;
    }

    let active = true;
    const run = state.playbackRun;
    const sceneId = scene.id;

    const update = (patch: Partial<PlayingState>) => {
      if (!active) {
        return;
      }
      setPlaying((current) => ({
        ...(current?.sceneId === sceneId && current.run === run ? current : {
          sceneId, run, phase: 'idle' as const, subtitle: null, effects: [], actionNotice: null,
        }),
        ...patch,
      }));
    };

    const engine = new PlaybackEngine(
      scene,
      new ActionEngine((effects) => update({ effects }), scene),
      {
        onModeChange: (mode) => update({ phase: mode }),
        onSpeechStart: (text) => update({ subtitle: text, phase: 'playing' }),
        onActionUnavailable: (_action, message) =>
          update({ actionNotice: message }),
        onComplete: () => update({ phase: 'ended' }),
      },
    );

    engineRef.current = engine;
    engine.start();

    if (firstPlayback.current && chat.getSnapshot().open) {
      engine.pause();
    }
    firstPlayback.current = false;

    return () => {
      active = false;
      engine.stop();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [scene, state.playbackRun, chat]);

  const activePlayback = playing && playing.sceneId === scene?.id && playing.run === state.playbackRun ? playing : null;

  const playPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const mode = engine.getMode();
    if (mode === 'playing') {
      engine.pause();
    } else if (mode === 'paused') {
      engine.resume();
    } else {
      session.replay();
    }
  }, [session]);

  const directory = data?.directory ?? [];
  const directoryIndex = directory.findIndex(
    (item) => item.sceneId !== null && item.sceneId === scene?.id,
  );

  const selectScene = useCallback(
    (id: string | null) => {
      session.selectScene(id);
      if (id && window.matchMedia(MOBILE_LAYOUT_MQ).matches) {
        setSidebarCollapsed(true);
      }
    },
    [session],
  );

  const navigateDirectory = useCallback(
    (offset: -1 | 1) => {
      const entries = session.getSnapshot().classroom?.directory ?? [];
      const currentIndex = entries.findIndex(
        (item) => item.sceneId === session.getSnapshot().sceneId,
      );
      const targetIndex = currentIndex + offset;
      if (targetIndex >= 0 && targetIndex < entries.length) {
        selectScene(entries[targetIndex].sceneId);
      }
    },
    [selectScene, session],
  );

  const selectPrevious = useCallback(
    () => navigateDirectory(-1),
    [navigateDirectory],
  );
  const selectNext = useCallback(
    () => navigateDirectory(1),
    [navigateDirectory],
  );

  // --- 全屏状态与课堂级快捷键 ---
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsPresenting(document.fullscreenElement === stageRef.current);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreClassroomKeydown(event)) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        playPause();
      } else if (event.key === 'ArrowLeft') {
        selectPrevious();
      } else if (event.key === 'ArrowRight') {
        selectNext();
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [playPause, selectNext, selectPrevious]);

  const notices = buildClassroomNotices(
    state.positionNotice,
    state.notice,
    activePlayback?.actionNotice,
    session,
  );

  const quizQuestions =
    scene?.content.type === 'quiz' ? scene.content.questions : [];

  const ungraded = collectUngradedQuestions(
    data,
    state.questions,
    session.key.bind(session),
  );

  const handleFullscreen = async () => {
    try {
      if (document.fullscreenElement === stageRef.current) {
        await document.exitFullscreen();
      } else {
        await stageRef.current?.requestFullscreen();
      }
    } catch {
      setPlaying((value) => value ? { ...value, actionNotice: '浏览器未允许全屏，可继续在当前窗口观看。' } : value);
    }
  };

  const handleLocateQuestion = (id: string, questionId: string) => {
    selectScene(id);
    requestAnimationFrame(() => {
      const element = document.getElementById(
        'question-' +
          encodeURIComponent(session.stageId + '/' + id + '/' + questionId),
      );
      element?.scrollIntoView({ block: 'center' });
      element?.focus();
    });
  };

  const chatPresentation = {
    state: chatState,
    canSend: state.page === 'ready' && !!scene && !!sessions.selected
      && !sessions.selecting && !sessions.creating && !sessions.deletions[sessions.selected.id],
    sessions: {
      state: sessions,
      onCreate: () => {
        void chat.create();
      },
      onSelect: (item: Parameters<typeof chat.select>[0]) => {
        void chat.select(item);
      },
      onDelete: (item: Parameters<typeof chat.delete>[0]) => {
        void chat.delete(item);
      },
      onCheckDeletion: (item: Parameters<typeof chat.checkDeletion>[0]) => {
        void chat.checkDeletion(item);
      },
      onRefresh: () => {
        void chat.refreshList();
      },
    },
    onOpen: () => {
      engineRef.current?.pause();
      if (window.matchMedia(NARROW_LAYOUT_MQ).matches) {
        setSidebarCollapsed(true);
      }
      chat.open();
    },
    onClose: chat.close,
    onChange: chat.changeDraft,
    onSend: () => {
      const snapshot = session.getSnapshot();
      if (snapshot.page === 'ready' && snapshot.sceneId) {
        void chat.send(
          snapshot.sceneId,
          !!snapshot.classroom?.stage.hasKnowledgeBase,
        );
      }
    },
    onRefresh: () => {
      void chat.refresh();
    },
    onRead: (id: string) => {
      void chat.readItem(id);
    },
    onRecover: (id: string) => {
      void chat.recover(id, !!session.getSnapshot().classroom?.stage.hasKnowledgeBase);
    },
  };

  const quizPresentation = scene
    ? {
        questions: Object.fromEntries(
          quizQuestions.map((question) => [
            question.id,
            state.questions[session.key(scene.id, question.id)] ?? {},
          ]),
        ),
        onChange: (id: string, answer: Parameters<typeof session.changeAnswer>[2]) => {
          session.changeAnswer(scene.id, id, answer);
        },
        onSubmit: (id: string) => {
          void session.submit(scene.id, id);
        },
        onRedo: (id: string) => {
          session.redo(scene.id, id);
        },
        onCancel: (id: string) => {
          session.cancelRedo(scene.id, id);
        },
        onRetry: (id: string) => {
          void session.retryGrading(scene.id, id);
        },
        onRead: (id: string) => {
          void session.readLatest(scene.id, id);
        },
        onSkip: selectNext,
      }
  : undefined;

  return (
    <div
      ref={stageRef}
      className="flex h-full min-h-0 flex-1 flex-col"
    >
      <ClassroomView
        directory={directory}
        scene={scene}
        pageState={state.page}
        generationUrl={state.generationUrl}
        playback={activePlayback?.phase ?? 'idle'}
        subtitle={activePlayback?.subtitle}
        effects={activePlayback?.effects ?? []}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        onSceneSelect={selectScene}
        onRead={() => {
          void session.refresh();
        }}
        notices={notices}
        generation={state.generation}
        onRetryGeneration={() => {
          void session.retryGeneration();
        }}
        allScenesReady={data?.allScenesReady}
        ungraded={ungraded}
        onLocateQuestion={handleLocateQuestion}
        onPlayPause={scene ? playPause : undefined}
        chat={chatPresentation}
        onNextSegment={activePlayback?.phase !== 'ended' && scene ? () => engineRef.current?.nextSegment() : undefined}
        onReplay={scene ? session.replay : undefined}
        onPrevious={directoryIndex > 0 ? selectPrevious : undefined}
        onNext={directoryIndex >= 0 && directoryIndex < directory.length - 1 ? selectNext : undefined}
        isPresenting={isPresenting}
        onFullscreen={handleFullscreen}
        quiz={quizPresentation}
      />
    </div>
  );
}