'use client';

import type { Scene } from '@/lib/types/scene';
import { ScreenCanvas } from '@/components/slide-renderer/Editor/ScreenCanvas';
import { QuizView } from '@/components/scene-renderers/quiz-view';
import type { QuizPresentation, TeachingEffect } from './classroom-view-types';

export function SceneRenderer({ scene, quiz, effects }: { scene: Scene; quiz?: QuizPresentation; effects?: TeachingEffect[] }) {
  if (scene.type !== scene.content.type) return <p role="alert">场景内容格式无效</p>;
  // 场景数据决定使用幻灯片画布还是测验交互视图。
  if (scene.content.type === 'slide') return <ScreenCanvas effects={effects} />;
  return <QuizView key={scene.id} questions={scene.content.questions} sceneId={scene.id} stageId={scene.stageId} presentation={quiz} effects={effects} />;
}
