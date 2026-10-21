'use client';

import { useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { CanvasToolbar } from '@/components/canvas/canvas-toolbar';
import type { CanvasToolbarProps } from '@/components/canvas/canvas-toolbar';
import type { Scene } from '@/lib/types/scene';
import { useI18n } from '@/lib/hooks/use-i18n';

interface CanvasAreaProps extends CanvasToolbarProps {
  readonly currentScene: Scene | null;
  readonly hideToolbar?: boolean;
  readonly isPendingScene?: boolean;
  readonly isCourseComplete?: boolean;
}

export function CanvasArea({
  currentScene,
  currentSceneIndex,
  scenesCount,
  engineState,
  sidebarCollapsed,
  onToggleSidebar,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  isPresenting,
  onTogglePresentation,
  hideToolbar,
  isPendingScene,
  isCourseComplete,
}: CanvasAreaProps) {
  const { t } = useI18n();
  const showPlayHint =
    engineState !== 'playing' && currentScene?.type === 'slide' && !isPendingScene;

  const handleSlideClick = useCallback(
    (event: React.MouseEvent) => {
      if (currentScene?.type !== 'slide') return;
      event.stopPropagation();
      onPlayPause();
    },
    [currentScene?.type, onPlayPause],
  );

  return (
    <div className="w-full min-h-0 flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 min-h-0 relative overflow-hidden flex items-center justify-center p-2">
        <div
          className={cn(
            'aspect-[16/9] h-full max-h-full max-w-full bg-white dark:bg-gray-800 shadow-2xl rounded-lg overflow-hidden relative',
            currentScene?.type === 'slide' && 'cursor-pointer',
          )}
          onClick={handleSlideClick}
        >
          {currentScene ? (
            <div className="absolute inset-0">
              <SceneProvider>
                <SceneRenderer scene={currentScene} />
              </SceneProvider>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {isCourseComplete
                ? t('classroom.courseComplete')
                : isPendingScene
                  ? t('classroom.sceneGenerating')
                  : t('classroom.noScene')}
            </div>
          )}

          {currentScene && (
            <div className="absolute top-4 right-4 text-gray-200 dark:text-gray-700 font-black text-4xl opacity-50 pointer-events-none select-none mix-blend-multiply dark:mix-blend-screen">
              {Math.max(1, currentSceneIndex + 1).toString().padStart(2, '0')}
            </div>
          )}

          <AnimatePresence>
            {showPlayHint && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[102] flex items-center justify-center pointer-events-none"
              >
                <motion.button
                  type="button"
                  aria-label={t('classroom.play')}
                  className="opacity-50 hover:opacity-100 transition-opacity duration-300 pointer-events-auto cursor-pointer w-20 h-20 rounded-full bg-white/95 dark:bg-gray-800/95 flex items-center justify-center shadow-lg"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlayPause();
                  }}
                  animate={{ scale: [1, 1.06] }}
                  transition={{ repeat: Infinity, repeatType: 'mirror', duration: 1 }}
                >
                  <Play className="w-7 h-7 text-purple-600 dark:text-purple-400 fill-purple-600/90 dark:fill-purple-400/90 ml-0.5" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {!hideToolbar && (
        <CanvasToolbar
          className="shrink-0 h-11 px-3"
          currentSceneIndex={currentSceneIndex}
          scenesCount={scenesCount}
          engineState={engineState}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          onPrevSlide={onPrevSlide}
          onNextSlide={onNextSlide}
          onPlayPause={onPlayPause}
          isPresenting={isPresenting}
          onTogglePresentation={onTogglePresentation}
        />
      )}
    </div>
  );
}
