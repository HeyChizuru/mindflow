'use client';

import { Stage } from '@/components/stage';
import { useStageStore } from '@/lib/store/stage';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Scene } from '@/lib/types/scene';
import type { SceneOutline } from '@/lib/types/outline';
import type { StageResponse } from '@/lib/types/stage';
import { useI18n } from '@/lib/hooks/use-i18n';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseClassroomPayload(value: unknown, classroomId: string): {
  stage: StageResponse;
  scenes: Scene[];
  outlines: SceneOutline[];
  generatingOutlines: SceneOutline[];
} {
  if (!isRecord(value) || value.success !== true || !isRecord(value.classroom)) {
    throw new Error('课堂读取响应格式无效');
  }

  const { stage, scenes, outlines, generatingOutlines } = value.classroom;
  if (!isRecord(stage) || stage.id !== classroomId || !Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('课堂数据不完整或没有可播放场景');
  }

  const validScenes = scenes.every(
    (scene) =>
      isRecord(scene) &&
      typeof scene.id === 'string' &&
      scene.stageId === classroomId &&
      (scene.type === 'slide' || scene.type === 'quiz') &&
      typeof scene.title === 'string' &&
      typeof scene.order === 'number' &&
      isRecord(scene.content) &&
      Array.isArray(scene.actions),
  );
  if (!validScenes) {
    throw new Error('课堂场景数据不完整');
  }

  if ((outlines !== undefined && !Array.isArray(outlines)) ||
      (generatingOutlines !== undefined && !Array.isArray(generatingOutlines))) {
    throw new Error('课堂目录数据格式无效');
  }

  return {
    stage: stage as unknown as StageResponse,
    scenes: scenes as Scene[],
    outlines: (outlines ?? []) as SceneOutline[],
    generatingOutlines: (generatingOutlines ?? []) as SceneOutline[],
  };
}

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;
  const { t } = useI18n();

  const [attempt, setAttempt] = useState(0);
  const [completedLoad, setCompletedLoad] = useState<{ classroomId: string; attempt: number } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<{
    classroomId: string;
    attempt: number;
    message: string;
  } | null>(null);
  const loading = completedLoad?.classroomId !== classroomId || completedLoad.attempt !== attempt;
  const error =
    loadError?.classroomId === classroomId && loadError.attempt === attempt
      ? loadError.message
      : null;

  const loadClassroom = useCallback(async () => {
    try {
      const response = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
      const responseText = await response.text();
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        throw new Error(`课堂读取响应无法解析（HTTP ${response.status}）`);
      }

      if (!response.ok) {
        const message = isRecord(responseBody) && typeof responseBody.error === 'string'
          ? responseBody.error
          : `课堂读取失败（HTTP ${response.status}）`;
        throw new Error(message);
      }

      const classroom = parseClassroomPayload(responseBody, classroomId);
      const store = useStageStore.getState();
      store.setStage(classroom.stage);
      store.setOutlines(classroom.outlines);
      store.setGeneratingOutlines(classroom.generatingOutlines);
      store.setScenes(classroom.scenes);
    } catch (loadError) {
      setLoadError({
        classroomId,
        attempt,
        message: loadError instanceof Error ? loadError.message : '读取课堂失败',
      });
    } finally {
      setCompletedLoad({ classroomId, attempt });
    }
  }, [attempt, classroomId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadClassroom();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [classroomId, loadClassroom]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {loading ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <p className="text-muted-foreground">{t('classroom.loading')}</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <p className="text-destructive mb-4">{t('classroom.loadFailed')}: {error}</p>
            <button
              onClick={() => setAttempt((current) => current + 1)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              {t('classroom.retry')}
            </button>
          </div>
        </div>
      ) : (
        <Stage />
      )}
    </div>
  );
}
