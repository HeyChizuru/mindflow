'use client';

import {
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';

export interface CanvasToolbarProps {
  readonly currentSceneIndex: number;
  readonly scenesCount: number;
  readonly engineState: 'idle' | 'playing' | 'paused';
  readonly sidebarCollapsed?: boolean;
  readonly onToggleSidebar?: () => void;
  readonly onPrevSlide: () => void;
  readonly onNextSlide: () => void;
  readonly onPlayPause: () => void;
  readonly isPresenting?: boolean;
  readonly onTogglePresentation?: () => void;
  readonly className?: string;
}

const buttonClass =
  'w-8 h-8 rounded-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-500/[0.08] dark:hover:bg-gray-400/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors';

export function CanvasToolbar({
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
  className,
}: CanvasToolbarProps) {
  const { t } = useI18n();
  const canGoPrev = currentSceneIndex > 0 && currentSceneIndex < scenesCount;
  const canGoNext = currentSceneIndex >= 0 && currentSceneIndex < scenesCount - 1;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        'bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-t border-gray-200/40 dark:border-gray-700/40',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={cn(buttonClass, sidebarCollapsed ? 'text-gray-400' : '')}
            aria-label={t('classroom.toggleOutline')}
          >
            <LayoutList className="w-4 h-4" />
          </button>
        )}
        <span className="text-xs text-gray-400 tabular-nums select-none">
          {currentSceneIndex < scenesCount ? currentSceneIndex + 1 : scenesCount}/{scenesCount}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrevSlide}
          disabled={!canGoPrev}
          className={buttonClass}
          aria-label={t('classroom.previousScene')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          disabled={scenesCount === 0}
          className={cn(buttonClass, 'w-9 h-9 text-purple-600 dark:text-purple-400')}
          aria-label={engineState === 'playing' ? t('classroom.pause') : t('classroom.play')}
        >
          {engineState === 'playing' ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-px" />
          )}
        </button>
        <button
          type="button"
          onClick={onNextSlide}
          disabled={!canGoNext}
          className={buttonClass}
          aria-label={t('classroom.nextScene')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {onTogglePresentation && (
        <button
          type="button"
          onClick={onTogglePresentation}
          className={buttonClass}
          aria-label={isPresenting ? t('classroom.exitFullscreen') : t('classroom.fullscreen')}
        >
          {isPresenting ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
