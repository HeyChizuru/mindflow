'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { migrateScene } from '@/lib/edit/slide-schema';
import type { Scene } from '@/lib/types/stage';

const log = createLogger('Classroom');

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const { loadFromStorage } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generationStartedRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });
  // 加载课堂数据
  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      // 若 IndexedDB 无数据，则尝试服务端存储（API 生成的课堂）
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);
        try {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes } = json.classroom;
              useStageStore.getState().setStage(stage);
              // Normalize legacy slide content (missing schemaVersion) on the
              // way in, same as the store's setScenes/loadFromStorage paths —
              // server snapshots predate the schema field.
              // 载入时规范化旧版幻灯片内容（缺少 schemaVersion），与 store 的
              // setScenes/loadFromStorage 路径一致 — 服务端快照早于 schema 字段引入。
              const migrated = (scenes as Scene[]).map(migrateScene);
              useStageStore.setState({
                scenes: migrated,
                currentSceneId: migrated[0]?.id ?? null,
                // Match `loadFromStorage` semantics: mode is transient UI
                // state, not persisted with the stage. Reset on every
                // classroom load so SPA navigation doesn't carry Pro
                // mode across.
                // 与 `loadFromStorage` 语义一致：mode 为瞬时 UI 状态，不随 stage 持久化。
                // 每次加载课堂时重置，避免 SPA 导航将 Pro 模式带入新课程。
                mode: 'playback',
              });
              log.info('Loaded from server-side storage:', classroomId);

              // Hydrate server-generated agents into IndexedDB + registry.
              // Don't set selectedAgentIds here — the general agent
              // restoration logic below (Path 2) handles it uniformly.
              // 将服务端生成的 agent 写入 IndexedDB 与注册表。
              // 此处不设置 selectedAgentIds — 下方通用 agent 恢复逻辑（路径 2）统一处理。
              if (stage.generatedAgentConfigs?.length) {
                const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
                await saveGeneratedAgents(stage.id, stage.generatedAgentConfigs);
                log.info('Hydrated server-generated agents for stage:', stage.id);
              }
            }
          }
        } catch (fetchErr) {
          log.warn('Server-side storage fetch failed:', fetchErr);
        }
      }

      // Restore completed media generation tasks from IndexedDB
      // 从 IndexedDB 恢复已完成的媒体生成任务
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // Restore agents for this stage
      // 恢复本课堂的 agent
      const { loadGeneratedAgentsForStage, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      const generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      const { useSettingsStore } = await import('@/lib/store/settings');
      if (generatedAgentIds.length > 0) {
        // Auto mode — use generated agents from IndexedDB
        // 自动模式 — 使用 IndexedDB 中的生成 agent
        useSettingsStore.getState().setAgentMode('auto');
        useSettingsStore.getState().setSelectedAgentIds(generatedAgentIds);
      } else {
        // Preset mode — restore agent IDs saved in the stage at creation time.
        // Filter out any stale generated IDs that may have been persisted before
        // the bleed-fix, so they don't resolve against a leftover registry entry.
        // 预设模式 — 恢复创建时保存在 stage 中的 agent ID。
        // 过滤 bleed-fix 之前可能持久化的陈旧生成 ID，避免匹配到残留注册表项。
        const stage = useStageStore.getState().stage;
        const stageAgentIds = stage?.agentIds;
        const registry = useAgentRegistry.getState();
        const cleanIds = stageAgentIds?.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        useSettingsStore.getState().setAgentMode('preset');
        useSettingsStore
          .getState()
          .setSelectedAgentIds(
            cleanIds && cleanIds.length > 0 ? cleanIds : ['default-1', 'default-2', 'default-3'],
          );
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    // 切换课程时重置加载状态，过渡期间卸载 Stage，防止陈旧数据同步到新课程
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    // 清除上一课堂的媒体任务，防止跨课堂污染。
    // 占位 ID（gen_img_1、gen_vid_1）在 stage 间并非全局唯一，旧任务会遮蔽新课堂任务。
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    // 清除白板历史，防止上一课程快照泄漏到当前课堂
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    // classroomId 变化或组件卸载时取消进行中的生成
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines
  // 自动恢复待处理大纲的生成
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // Check if there are pending outlines
    // 检查是否存在待处理大纲
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;

      // Load generation params from sessionStorage (stored by generation-preview before navigating)
      // 从 sessionStorage 加载生成参数（由 generation-preview 在导航前写入）
      const genParamsStr = sessionStorage.getItem('generationParams');
      const params = genParamsStr ? JSON.parse(genParamsStr) : {};

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      // 根据 pdfImages 的 storageId 从 IndexedDB 重建 imageMapping
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter(Boolean);

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
          languageDirective: params.languageDirective || stage.languageDirective,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      // 所有场景已生成，但部分媒体可能尚未完成。
      // 为 IndexedDB 中尚未存在的任务恢复媒体生成。
      // generateMediaForOutlines 会自动跳过已完成的任务。
      generationStartedRef.current = true;
      generateMediaForOutlines(outlines, stage.id).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
      });
    }
  }, [loading, error, generateRemaining]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage onRetryOutline={retrySingleOutline} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
