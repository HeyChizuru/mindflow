'use client';

import { Stage } from '@/components/stage';
import { useStageStore } from '@/lib/store/stage';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Scene } from '@/lib/types/scene';
import { useI18n } from '@/lib/hooks/use-i18n';

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;
  const { t } = useI18n();
  const { loadFromStorage } = useStageStore();

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
      await loadFromStorage(classroomId);

      // API-generated classrooms are not available in IndexedDB. Keep the
      // existing read fallback until the classroom API is connected later.
      if (!useStageStore.getState().stage) {
        const response = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
        if (response.ok) {
          const json = await response.json();
          if (json.success && json.classroom) {
            const { stage, scenes } = json.classroom;
            useStageStore.getState().setStage(stage);
            useStageStore.setState({
              scenes: scenes as Scene[],
              currentSceneId: (scenes as Scene[])[0]?.id ?? null,
            });
          }
        }
      }
    } catch (loadError) {
      setLoadError({
        classroomId,
        attempt,
        message: loadError instanceof Error ? loadError.message : '读取课堂失败',
      });
    } finally {
      setCompletedLoad({ classroomId, attempt });
    }
  }, [attempt, classroomId, loadFromStorage]);

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
