'use client';

import { useMemo } from 'react';
import type { Scene } from '@/lib/types/scene';
import { SlideEditor as SlideRenderer } from '@/components/slide-renderer/Editor';
import { QuizView } from '@/components/scene-renderers/quiz-view';

interface SceneRendererProps {
  readonly scene: Scene;
}

/** Dispatches only the slide and quiz scene types supported by classroom playback. */
export function SceneRenderer({ scene }: SceneRendererProps) {
  const renderer = useMemo(() => {
    switch (scene.type) {
      case 'slide':
        if (scene.content.type !== 'slide') return <div role="alert">幻灯片内容格式无效</div>;
        return <SlideRenderer />;
      case 'quiz':
        if (scene.content.type !== 'quiz') return <div role="alert">测验内容格式无效</div>;
        return <QuizView key={scene.id} questions={scene.content.questions} sceneId={scene.id} />;
      default:
        return <div role="status">暂不支持此场景类型</div>;
    }
  }, [scene]);

  return <div className="w-full h-full">{renderer}</div>;
}
