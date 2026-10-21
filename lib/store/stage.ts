import { create } from 'zustand';
import type { Stage, Scene, StageMode } from '@/lib/types/stage';
import { createSelectors } from '@/lib/utils/create-selectors';
import type { ChatSession } from '@/lib/types/chat';
import type { SceneOutline } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { useCanvasStore } from '@/lib/store/canvas';
import { migrateScene } from '@/lib/edit/slide-schema';

const log = createLogger('StageStore');

/** Virtual scene ID used when the user navigates to a page still being generated / 用户导航到仍在生成中的页面时使用的虚拟场景 ID */
export const PENDING_SCENE_ID = '__pending__';

// ==================== Debounce Helper / 防抖辅助函数 ====================

/**
 * Debounce function to limit how often a function is called
 * 防抖函数，限制函数调用频率
 * @param func Function to debounce / 需要防抖的函数
 * @param delay Delay in milliseconds / 延迟时间（毫秒）
 */
function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

type ToolbarState = 'design' | 'ai';

interface StageState {
  // Stage info / 舞台信息
  stage: Stage | null;

  // Scenes / 场景
  scenes: Scene[];
  currentSceneId: string | null;

  // Chats / 聊天
  chats: ChatSession[];

  // Mode / 模式
  mode: StageMode;

  // UI state / UI 状态
  toolbarState: ToolbarState;

  // Transient generation state (not persisted) / 临时生成状态（不持久化）
  generatingOutlines: SceneOutline[];

  // Persisted outlines for resume-on-refresh / 持久化大纲，用于刷新后恢复
  outlines: SceneOutline[];

  // Transient generation tracking (not persisted) / 临时生成追踪（不持久化）
  generationEpoch: number;
  generationStatus: 'idle' | 'generating' | 'paused' | 'completed' | 'error';
  currentGeneratingOrder: number;
  failedOutlines: SceneOutline[];

  // Actions / 操作
  setStage: (stage: Stage) => void;
  setScenes: (scenes: Scene[]) => void;
  addScene: (scene: Scene) => void;
  insertSceneAfter: (anchorSceneId: string, scene: Scene) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  deleteScene: (sceneId: string) => void;
  setCurrentSceneId: (sceneId: string | null) => void;
  setChats: (chats: ChatSession[]) => void;
  setMode: (mode: StageMode) => void;
  setToolbarState: (state: ToolbarState) => void;
  setGeneratingOutlines: (outlines: SceneOutline[]) => void;
  setOutlines: (outlines: SceneOutline[]) => void;
  setGenerationStatus: (status: 'idle' | 'generating' | 'paused' | 'completed' | 'error') => void;
  setCurrentGeneratingOrder: (order: number) => void;
  bumpGenerationEpoch: () => void;
  addFailedOutline: (outline: SceneOutline) => void;
  clearFailedOutlines: () => void;
  retryFailedOutline: (outlineId: string) => void;

  // Getters / 获取器
  getCurrentScene: () => Scene | null;
  getSceneById: (sceneId: string) => Scene | null;
  getSceneIndex: (sceneId: string) => number;

  // Storage / 存储
  saveToStorage: () => Promise<void>;
  loadFromStorage: (stageId: string) => Promise<void>;
  clearStore: () => void;
}

const useStageStoreBase = create<StageState>()((set, get) => ({
  // Initial state / 初始状态
  stage: null,
  scenes: [],
  currentSceneId: null,
  chats: [],
  mode: 'playback',
  toolbarState: 'ai',
  generatingOutlines: [],
  outlines: [],
  generationEpoch: 0,
  generationStatus: 'idle' as const,
  currentGeneratingOrder: -1,
  failedOutlines: [],

  // Actions / 操作
  setStage: (stage) => {
    set((s) => ({
      stage,
      scenes: [],
      currentSceneId: null,
      chats: [],
      generationEpoch: s.generationEpoch + 1,
    }));
    debouncedSave();
  },

  setScenes: (scenes) => {
    // Funnel through migrateScene so any incoming slide content lacking
    // a schemaVersion (API / snapshot / legacy) is normalized once at
    // the store boundary.
    // 通过 migrateScene 统一处理：任何缺少 schemaVersion 的幻灯片内容
    //（API / 快照 / 遗留数据）在 store 边界处一次性规范化。
    const migrated = scenes.map(migrateScene);
    set({ scenes: migrated });
    // Auto-select first scene if no current scene / 若无当前场景则自动选中第一个
    if (!get().currentSceneId && migrated.length > 0) {
      set({ currentSceneId: migrated[0].id });
    }
    debouncedSave();
  },

  addScene: (scene) => {
    const currentStage = get().stage;
    // Ignore scenes from different stages (prevents race condition during generation)
    // 忽略来自其他舞台的场景（防止生成过程中的竞态条件）
    if (!currentStage || scene.stageId !== currentStage.id) {
      log.warn(
        `Ignoring scene "${scene.title}" - stageId mismatch (scene: ${scene.stageId}, current: ${currentStage?.id})`,
      );
      return;
    }
    const scenes = [...get().scenes, migrateScene(scene)];
    // Remove the matching outline from generatingOutlines (match by order)
    // 从 generatingOutlines 中移除匹配的大纲（按 order 匹配）
    const generatingOutlines = get().generatingOutlines.filter((o) => o.order !== scene.order);
    // Auto-switch from pending page to the newly generated scene
    // 从待生成页面自动切换到新生成的场景
    const shouldSwitch = get().currentSceneId === PENDING_SCENE_ID;
    set({
      scenes,
      generatingOutlines,
      ...(shouldSwitch ? { currentSceneId: scene.id } : {}),
    });
    debouncedSave();
  },

  insertSceneAfter: (anchorSceneId, scene) => {
    // Pro mode slide management entry point — inserts after the anchor and
    // rebalances `order` so PPTX export / array position stay consistent.
    // Edit mode is gated against active regeneration (see useEditModeLock),
    // so rewriting `order` here is safe — no outline matcher is racing us.
    // Pro 模式幻灯片管理入口 —— 在锚点之后插入并重新平衡 `order`，
    // 使 PPTX 导出 / 数组位置保持一致。
    // 编辑模式在活跃重新生成期间被锁定（见 useEditModeLock），
    // 因此在此重写 `order` 是安全的 —— 没有大纲匹配器与我们竞争。
    const currentStage = get().stage;
    if (!currentStage || scene.stageId !== currentStage.id) {
      log.warn(
        `insertSceneAfter ignored "${scene.title}" - stageId mismatch (scene: ${scene.stageId}, current: ${currentStage?.id})`,
      );
      return;
    }
    const current = get().scenes;
    const anchorIndex = current.findIndex((s) => s.id === anchorSceneId);
    const insertIndex = anchorIndex < 0 ? current.length : anchorIndex + 1;
    const migrated = migrateScene(scene);
    const next = [...current.slice(0, insertIndex), migrated, ...current.slice(insertIndex)];
    const rebalanced = next.map((s, i) => (s.order === i + 1 ? s : { ...s, order: i + 1 }));
    set({ scenes: rebalanced });
    debouncedSave();
  },

  updateScene: (sceneId, updates) => {
    const scenes = get().scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, ...updates } : scene,
    );
    set({ scenes });
    debouncedSave();
  },

  deleteScene: (sceneId) => {
    const scenes = get().scenes.filter((scene) => scene.id !== sceneId);
    const currentSceneId = get().currentSceneId;

    // If deleted scene was current, select next or previous
    // 若删除的是当前场景，则选中下一个或上一个
    if (currentSceneId === sceneId) {
      const index = get().getSceneIndex(sceneId);
      const newIndex = index < scenes.length ? index : scenes.length - 1;
      set({
        scenes,
        currentSceneId: scenes[newIndex]?.id || null,
      });
    } else {
      set({ scenes });
    }
    debouncedSave();
  },

  setCurrentSceneId: (sceneId) => {
    set({ currentSceneId: sceneId });
    debouncedSave();
  },

  setChats: (chats) => {
    set({ chats });
    debouncedSave();
  },

  setMode: (mode) => {
    const previousMode = get().mode;
    set({ mode });

    if (previousMode === 'edit' && mode !== 'edit') {
      useCanvasStore.getState().resetCanvasState();
    }
  },

  setToolbarState: (toolbarState) => set({ toolbarState }),

  setGeneratingOutlines: (generatingOutlines) => set({ generatingOutlines }),

  setOutlines: (outlines) => {
    set({ outlines });
    // Persist outlines to IndexedDB / 将大纲持久化到 IndexedDB
    const stageId = get().stage?.id;
    if (stageId) {
      import('@/lib/utils/database').then(({ db }) => {
        db.stageOutlines.put({
          stageId,
          outlines,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });
    }
  },

  setGenerationStatus: (generationStatus) => set({ generationStatus }),

  setCurrentGeneratingOrder: (currentGeneratingOrder) => set({ currentGeneratingOrder }),

  bumpGenerationEpoch: () => set((s) => ({ generationEpoch: s.generationEpoch + 1 })),

  addFailedOutline: (outline) => {
    const existed = get().failedOutlines.some((o) => o.id === outline.id);
    if (existed) return;
    set({ failedOutlines: [...get().failedOutlines, outline] });
  },

  clearFailedOutlines: () => set({ failedOutlines: [] }),

  retryFailedOutline: (outlineId) => {
    set({
      failedOutlines: get().failedOutlines.filter((o) => o.id !== outlineId),
    });
  },

  // Getters / 获取器
  getCurrentScene: () => {
    const { scenes, currentSceneId } = get();
    if (!currentSceneId) return null;
    return scenes.find((s) => s.id === currentSceneId) || null;
  },

  getSceneById: (sceneId) => {
    return get().scenes.find((s) => s.id === sceneId) || null;
  },

  getSceneIndex: (sceneId) => {
    return get().scenes.findIndex((s) => s.id === sceneId);
  },

  // Storage methods / 存储方法
  saveToStorage: async () => {
    const { stage, scenes, currentSceneId, chats } = get();
    if (!stage?.id) {
      log.warn('Cannot save: stage.id is required');
      return;
    }

    try {
      const { saveStageData } = await import('@/lib/utils/stage-storage');
      await saveStageData(stage.id, {
        stage,
        scenes,
        currentSceneId,
        chats,
      });
    } catch (error) {
      log.error('Failed to save to storage:', error);
    }
  },

  loadFromStorage: async (stageId: string) => {
    try {
      // Skip IndexedDB load if the store already has this stage with scenes
      // (e.g. navigated from generation-preview with fresh in-memory data)
      // 若 store 中已有该舞台的场景数据则跳过 IndexedDB 加载
      //（例如从 generation-preview 导航而来，内存中已有最新数据）
      const currentState = get();
      if (currentState.stage?.id === stageId && currentState.scenes.length > 0) {
        log.info('Stage already loaded in memory, skipping IndexedDB load:', stageId);
        return;
      }

      const { loadStageData } = await import('@/lib/utils/stage-storage');
      const data = await loadStageData(stageId);

      // Load outlines for resume-on-refresh / 加载大纲以支持刷新后恢复
      const { db } = await import('@/lib/utils/database');
      const outlinesRecord = await db.stageOutlines.get(stageId);
      const outlines = outlinesRecord?.outlines || [];

      if (data) {
        // Normalize legacy slide content (missing schemaVersion) at the load
        // boundary, same as setScenes/addScene — IndexedDB snapshots predate
        // the schema field, so they must be migrated on the way in.
        // 在加载边界处规范化遗留幻灯片内容（缺少 schemaVersion），
        // 与 setScenes/addScene 一致 —— IndexedDB 快照早于 schema 字段，
        // 因此必须在加载时进行迁移。
        const migrated = data.scenes.map(migrateScene);
        set({
          stage: data.stage,
          scenes: migrated,
          currentSceneId: data.currentSceneId,
          chats: data.chats,
          outlines,
          // Compute generatingOutlines from persisted outlines minus completed scenes
          // 从持久化大纲中减去已完成场景，计算 generatingOutlines
          generatingOutlines: outlines.filter((o) => !migrated.some((s) => s.order === o.order)),
          // `mode` is transient UI state, not persisted with the stage.
          // Reset to 'playback' on every load so SPA navigation between
          // classrooms doesn't carry Pro-mode state across — e.g. user
          // enters edit in A, navigates to B → B was inheriting
          // mode='edit'. Refresh already reset via initial store value;
          // this normalises the SPA path to match.
          // `mode` 是临时 UI 状态，不随舞台持久化。
          // 每次加载时重置为 'playback'，防止 SPA 导航在课堂之间
          // 携带 Pro 模式状态 —— 例如用户在 A 进入编辑模式后导航到 B，
          // B 会继承 mode='edit'。刷新已通过初始 store 值重置；
          // 此处规范化 SPA 路径以保持一致。
          mode: 'playback',
        });
        log.info('Loaded from storage:', stageId);
      } else {
        log.warn('No data found for stage:', stageId);
      }
    } catch (error) {
      log.error('Failed to load from storage:', error);
      throw error;
    }
  },

  clearStore: () => {
    set((s) => ({
      stage: null,
      scenes: [],
      currentSceneId: null,
      chats: [],
      outlines: [],
      generationEpoch: s.generationEpoch + 1,
      generationStatus: 'idle' as const,
      currentGeneratingOrder: -1,
      failedOutlines: [],
      generatingOutlines: [],
    }));
    log.info('Store cleared');
  },
}));

export const useStageStore = createSelectors(useStageStoreBase);

// ==================== Debounced Save / 防抖保存 ====================

/**
 * Debounced version of saveToStorage to prevent excessive writes
 * Waits 500ms after the last change before saving
 * saveToStorage 的防抖版本，防止过度写入
 * 在最后一次变更后等待 500ms 再保存
 */
const debouncedSave = debounce(() => {
  useStageStore.getState().saveToStorage();
}, 500);
