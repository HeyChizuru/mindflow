'use client';

import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { CanvasToolbar, type CanvasToolbarProps } from './canvas-toolbar';
import type { Scene } from '@/lib/types/scene';
import type { QuizPresentation, TeachingEffect } from '@/components/stage/classroom-view-types';
import { useI18n } from '@/lib/hooks/use-i18n';

export function CanvasArea({ currentScene, quiz, effects, ...toolbar }: CanvasToolbarProps & {
  currentScene: Scene | null; quiz?: QuizPresentation; effects?: TeachingEffect[];
}) {
  const { t } = useI18n();
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/40">
      {currentScene ? <SceneProvider scene={currentScene}><SceneRenderer key={currentScene.id} scene={currentScene} quiz={quiz} effects={effects} /></SceneProvider>
        : <p className="p-6 text-sm text-muted-foreground">{t('classroom.noScene')}</p>}
    </div>
    <CanvasToolbar {...toolbar} />
  </div>;
}
