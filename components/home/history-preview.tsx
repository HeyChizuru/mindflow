'use client';

import { BookOpen, FileQuestion } from 'lucide-react';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { ScreenCanvas } from '@/components/slide-renderer/Editor/ScreenCanvas';
import type { StageHistoryItem } from '@/lib/types/stage-history';
import type { Scene } from '@/lib/types/scene';

export function HistoryPreview({ item }: { item: StageHistoryItem }) {
  if (item.preview?.type === 'slide') {
    // Explicit read-only context: no classroom store writes, playback engine, actions or quiz data.
    const scene: Scene = { id: item.id, stageId: item.id, outlineId: 'history-preview', type: 'slide',
      title: item.name, order: 1, actions: [], createdAt: item.createdAt, updatedAt: item.createdAt,
      content: { type: 'slide', canvas: item.preview.canvas } };
    return <div aria-hidden="true" className="pointer-events-none size-full p-3">
      <SceneProvider scene={scene}><ScreenCanvas effects={[]} /></SceneProvider>
    </div>;
  }
  const quiz = item.preview?.type === 'quiz';
  return <div aria-hidden="true" className="flex size-full flex-col items-center justify-center gap-3 bg-muted/40 px-6 text-center">
    {quiz ? <FileQuestion className="size-8 text-primary/60" /> : <BookOpen className="size-8 text-muted-foreground/40" />}
    <p className="line-clamp-2 text-sm font-medium text-muted-foreground">{quiz ? item.preview?.title : item.phase === 'invalid' ? '课堂数据暂时无法预览' : '课堂内容准备中'}</p>
    <p className="text-xs text-muted-foreground/60">{quiz ? '测验 · 进入课堂后作答' : item.phase === 'draft' ? '继续完善课程大纲' : '已保存的课堂，随时回来继续'}</p>
  </div>;
}
