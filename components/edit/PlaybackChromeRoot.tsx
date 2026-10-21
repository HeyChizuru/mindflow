'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStageStore, PENDING_SCENE_ID } from '@/lib/store/stage';
import { useI18n } from '@/lib/hooks/use-i18n';
import { SceneSidebar } from '@/components/stage/scene-sidebar';
import { Header } from '@/components/header';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { PlaybackEngine } from '@/lib/playback';
import type { EngineMode, TriggerEvent } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import type { Scene } from '@/lib/types/scene';
import type { SpeechAction } from '@/lib/types/action';

interface ScenePlaybackState {
  sceneKey: string | null;
  engineMode: EngineMode;
  lectureSpeech: string | null;
  discussionTrigger: TriggerEvent | null;
  playbackCompleted: boolean;
}

const EMPTY_PLAYBACK_STATE: Omit<ScenePlaybackState, 'sceneKey'> = {
  engineMode: 'idle',
  lectureSpeech: null,
  discussionTrigger: null,
  playbackCompleted: false,
};

export function PlaybackChromeRoot() {
  const { t } = useI18n();
  const {
    scenes,
    outlines,
    generatingOutlines,
    currentSceneId,
    setCurrentSceneId,
    getCurrentScene,
  } = useStageStore();
  const currentScene: Scene | null = getCurrentScene();
  const sceneKey = currentScene?.id ?? currentSceneId ?? PENDING_SCENE_ID;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [playbackState, setPlaybackState] = useState<ScenePlaybackState>({
    sceneKey: null,
    ...EMPTY_PLAYBACK_STATE,
  });
  const [isPresenting, setIsPresenting] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const engineRef = useRef<PlaybackEngine | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const presentationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [audioPlayer] = useState(() => createAudioPlayer());
  const scenePlaybackState =
    playbackState.sceneKey === sceneKey
      ? playbackState
      : { sceneKey, ...EMPTY_PLAYBACK_STATE };
  const { engineMode, lectureSpeech, discussionTrigger, playbackCompleted } = scenePlaybackState;

  const updateScenePlaybackState = useCallback(
    (key: string, updates: Partial<Omit<ScenePlaybackState, 'sceneKey'>>) => {
      setPlaybackState((current) => ({
        ...(current.sceneKey === key ? current : { sceneKey: key, ...EMPTY_PLAYBACK_STATE }),
        ...updates,
      }));
    },
    [],
  );

  const currentSceneIndex =
    currentSceneId === PENDING_SCENE_ID
      ? scenes.length
      : scenes.findIndex((scene) => scene.id === currentSceneId);
  const isPendingScene = currentSceneId === PENDING_SCENE_ID;
  const isCourseComplete =
    outlines.length > 0 && scenes.length === outlines.length && generatingOutlines.length === 0;
  const idleText = useMemo(
    () =>
      currentScene?.actions?.find((action): action is SpeechAction => action.type === 'speech')
        ?.text ?? null,
    [currentScene],
  );

  useEffect(() => {
    engineRef.current?.stop();

    if (!currentScene?.actions?.length) {
      engineRef.current = null;
      return;
    }

    const engine = new PlaybackEngine(
      [currentScene],
      new ActionEngine(useStageStore, audioPlayer),
      audioPlayer,
      {
        onModeChange: (mode) => updateScenePlaybackState(sceneKey, { engineMode: mode }),
        onSpeechStart: (speech) => updateScenePlaybackState(sceneKey, { lectureSpeech: speech }),
        onProactiveShow: (trigger) => {
          updateScenePlaybackState(sceneKey, { discussionTrigger: trigger });
          // A discussion action is shown as a prompt; it does not start an Agent session.
          engineRef.current?.pause();
        },
        onProactiveHide: () => updateScenePlaybackState(sceneKey, { discussionTrigger: null }),
        onComplete: () => updateScenePlaybackState(sceneKey, { playbackCompleted: true }),
      },
    );
    engineRef.current = engine;

    return () => {
      engine.stop();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [audioPlayer, currentScene, sceneKey, updateScenePlaybackState]);

  useEffect(
    () => () => {
      if (presentationTimerRef.current) clearTimeout(presentationTimerRef.current);
      audioPlayer.destroy();
    },
    [audioPlayer],
  );

  const handlePlayPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const mode = engine.getMode();
    if (mode === 'playing' || mode === 'live') {
      engine.pause();
    } else if (mode === 'paused') {
      engine.resume();
    } else {
      if (playbackCompleted) {
        updateScenePlaybackState(sceneKey, { playbackCompleted: false });
        engine.start();
      }
      else engine.continuePlayback();
    }
  }, [playbackCompleted, sceneKey, updateScenePlaybackState]);

  const handleContinueLecture = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.skipDiscussion();
    if (engine.getMode() === 'paused') engine.resume();
  }, []);

  const handlePreviousScene = useCallback(() => {
    if (isPendingScene) {
      if (scenes.length > 0) setCurrentSceneId(scenes[scenes.length - 1].id);
      return;
    }
    const index = scenes.findIndex((scene) => scene.id === currentSceneId);
    if (index > 0) setCurrentSceneId(scenes[index - 1].id);
  }, [currentSceneId, isPendingScene, scenes, setCurrentSceneId]);

  const handleNextScene = useCallback(() => {
    if (isPendingScene) return;
    const index = scenes.findIndex((scene) => scene.id === currentSceneId);
    if (index >= 0 && index < scenes.length - 1) {
      setCurrentSceneId(scenes[index + 1].id);
    } else if (index === scenes.length - 1 && (generatingOutlines.length > 0 || isCourseComplete)) {
      setCurrentSceneId(PENDING_SCENE_ID);
    }
  }, [currentSceneId, generatingOutlines.length, isCourseComplete, isPendingScene, scenes, setCurrentSceneId]);

  const togglePresentation = useCallback(async () => {
    const stageElement = stageRef.current;
    if (!stageElement) return;
    try {
      if (document.fullscreenElement === stageElement) await document.exitFullscreen();
      else await stageElement.requestFullscreen();
    } catch {
      // Fullscreen can be denied by the browser; the classroom remains usable.
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setIsPresenting(active);
      setControlsVisible(true);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isPresenting) return;
    const showControls = () => {
      setControlsVisible(true);
      if (presentationTimerRef.current) clearTimeout(presentationTimerRef.current);
      presentationTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    };
    window.addEventListener('mousemove', showControls);
    window.addEventListener('keydown', showControls);
    showControls();
    return () => {
      window.removeEventListener('mousemove', showControls);
      window.removeEventListener('keydown', showControls);
      if (presentationTimerRef.current) clearTimeout(presentationTimerRef.current);
    };
  }, [isPresenting]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        handlePlayPause();
      } else if (event.key === 'ArrowLeft') {
        handlePreviousScene();
      } else if (event.key === 'ArrowRight') {
        handleNextScene();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextScene, handlePlayPause, handlePreviousScene]);

  const visibleEngineState =
    engineMode === 'playing' ? 'playing' : engineMode === 'paused' ? 'paused' : 'idle';

  return (
    <div ref={stageRef} className="flex flex-1 min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <SceneSidebar
        collapsed={sidebarCollapsed}
        onCollapseChange={setSidebarCollapsed}
        onSceneSelect={setCurrentSceneId}
        isCourseComplete={isCourseComplete}
      />

      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative">
        {!isPresenting && (
          <Header
            currentSceneTitle={
              currentScene?.title || (isPendingScene && isCourseComplete ? t('classroom.courseComplete') : '')
            }
          />
        )}

        <CanvasArea
          currentScene={currentScene}
          currentSceneIndex={currentSceneIndex}
          scenesCount={scenes.length}
          engineState={visibleEngineState}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
          onPrevSlide={handlePreviousScene}
          onNextSlide={handleNextScene}
          onPlayPause={handlePlayPause}
          isPresenting={isPresenting}
          onTogglePresentation={togglePresentation}
          hideToolbar={isPresenting && !controlsVisible}
          isPendingScene={isPendingScene}
          isCourseComplete={isCourseComplete}
        />

        {!isPresenting && (
          <section
            aria-label={t('classroom.subtitle')}
            aria-live="polite"
            className="min-h-16 px-6 py-3 flex items-center justify-center border-t border-gray-200/60 dark:border-gray-700/60 bg-white/80 dark:bg-gray-800/80"
          >
            {discussionTrigger ? (
              <div className="w-full max-w-4xl flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                    {t('classroom.discussionPrompt')}
                  </p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {discussionTrigger.question}
                  </p>
                  {discussionTrigger.prompt && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {discussionTrigger.prompt}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleContinueLecture}
                  className="shrink-0 rounded-md bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700"
                >
                  {t('classroom.continueLecture')}
                </button>
              </div>
            ) : (
              <p className="w-full max-w-4xl text-sm text-gray-700 dark:text-gray-200">
                {lectureSpeech || idleText || t('classroom.subtitleWaiting')}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
