'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, CircleHelp, FileText, PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useI18n } from '@/lib/hooks/use-i18n';
import { PENDING_SCENE_ID } from '@/lib/store/stage';

interface SceneSidebarProps {
  readonly collapsed: boolean;
  readonly onCollapseChange: (collapsed: boolean) => void;
  readonly onSceneSelect?: (sceneId: string) => void;
  readonly isCourseComplete?: boolean;
}

const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 170;
const MAX_WIDTH = 400;

export function SceneSidebar({
  collapsed,
  onCollapseChange,
  onSceneSelect,
  isCourseComplete,
}: SceneSidebarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { scenes, currentSceneId, setCurrentSceneId, generatingOutlines } = useStageStore();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);

  const handleSceneSelect = useCallback(
    (sceneId: string) => {
      if (onSceneSelect) onSceneSelect(sceneId);
      else setCurrentSceneId(sceneId);
    },
    [onSceneSelect, setCurrentSceneId],
  );

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setIsDragging(true);
      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = startWidth + moveEvent.clientX - startX;
        setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)));
      };
      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [sidebarWidth],
  );

  const displayWidth = collapsed ? 0 : sidebarWidth;

  return (
    <aside
      aria-label={t('classroom.outline')}
      style={{
        width: displayWidth,
        transition: isDragging ? 'none' : 'width 0.3s ease',
      }}
      className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_24px_rgba(0,0,0,0.02)] flex flex-col shrink-0 z-20 relative overflow-visible"
    >
      {!collapsed && (
        <div
          onMouseDown={handleDragStart}
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 group hover:bg-purple-400/30 dark:hover:bg-purple-600/30 active:bg-purple-500/40 dark:active:bg-purple-500/40 transition-colors"
        >
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-purple-400 dark:group-hover:bg-purple-500 transition-colors" />
        </div>
      )}

      <div className={cn('flex flex-col w-full h-full overflow-hidden', collapsed && 'hidden')}>
        <div className="h-12 flex items-center justify-between shrink-0 mt-3 mb-1 px-3">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-gray-100/80 dark:hover:bg-gray-800/60 transition-colors"
            title={t('generation.backToHome')}
          >
            <img src="/logo-horizontal.png" alt="MindFlow" className="h-6" />
          </button>
          <button
            type="button"
            onClick={() => onCollapseChange(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-100/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 hover:bg-gray-200/90 dark:hover:bg-gray-700/90 transition-colors"
            aria-label={t('classroom.collapseOutline')}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div data-testid="scene-list" className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {scenes.map((scene, index) => {
            const isActive = currentSceneId === scene.id;
            const Icon = scene.type === 'slide' ? BookOpen : scene.type === 'quiz' ? CircleHelp : FileText;
            const typeLabel =
              scene.type === 'slide'
                ? t('generation.sceneTypeSlide')
                : scene.type === 'quiz'
                  ? t('generation.sceneTypeQuiz')
                  : t('classroom.unsupportedScene');

            return (
              <button
                key={scene.id}
                type="button"
                data-testid="scene-item"
                aria-current={isActive ? 'step' : undefined}
                onClick={() => handleSceneSelect(scene.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2.5 transition-colors',
                  isActive
                    ? 'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-200 dark:ring-purple-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                      isActive
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {index + 1}
                  </span>
                  <Icon className="w-4 h-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span data-testid="scene-title" className="block text-xs font-semibold truncate">
                      {scene.title}
                    </span>
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                      {typeLabel}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}

          {generatingOutlines.length > 0 && (
            <button
              type="button"
              onClick={() => handleSceneSelect(PENDING_SCENE_ID)}
              aria-current={currentSceneId === PENDING_SCENE_ID ? 'step' : undefined}
              className={cn(
                'w-full text-left rounded-lg px-3 py-2.5 transition-colors',
                currentSceneId === PENDING_SCENE_ID
                  ? 'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-200 dark:ring-purple-700'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">
                  {scenes.length + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold truncate">
                    {generatingOutlines[0]?.title || t('classroom.nextScene')}
                  </span>
                  <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                    {t('classroom.sceneGenerating')}
                  </span>
                </span>
              </span>
            </button>
          )}

          {isCourseComplete && generatingOutlines.length === 0 && (
            <button
              type="button"
              onClick={() => handleSceneSelect(PENDING_SCENE_ID)}
              aria-current={currentSceneId === PENDING_SCENE_ID ? 'step' : undefined}
              className={cn(
                'w-full text-left rounded-lg px-3 py-2.5 transition-colors text-amber-700 dark:text-amber-300',
                currentSceneId === PENDING_SCENE_ID
                  ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-700'
                  : 'hover:bg-amber-50/60 dark:hover:bg-amber-900/10',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 shrink-0">
                  {scenes.length + 1}
                </span>
                <span className="text-xs font-semibold">{t('classroom.courseComplete')}</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
