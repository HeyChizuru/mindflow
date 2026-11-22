'use client';

import type { Scene } from '@/lib/types/scene';
import { ScreenCanvas } from '@/components/slide-renderer/Editor/ScreenCanvas';
import { QuizView } from '@/components/scene-renderers/quiz-view';
import type { QuizPresentation, TeachingEffect } from './classroom-view-types';

export type SceneRendererProps = {
  scene: Scene;
  quiz?: QuizPresentation;
  effects?: TeachingEffect[];
};

/**
 * 按场景类型分发：幻灯片走 ScreenCanvas，测验走 QuizView。
 * scene.type 与 content.type 不一致时展示错误提示。
 */
export function SceneRenderer({ scene, quiz, effects }: SceneRendererProps) {
  if (scene.type !== scene.content.type) {
    return <p role="alert">场景内容格式无效</p>;
  }

  if (scene.content.type === 'slide') {
    return <ScreenCanvas effects={effects} />;
  }

  return (
    <QuizView
      key={scene.id}
      questions={scene.content.questions}
      sceneId={scene.id}
      stageId={scene.stageId}
      presentation={quiz}
      effects={effects}
    />
  );
}