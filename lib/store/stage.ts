import { create } from 'zustand';
import { createSelectors } from '@/lib/utils/create-selectors';
import type { Scene } from '@/lib/types/scene';
import type { SceneOutline } from '@/lib/types/outline';
import type { StageResponse } from '@/lib/types/stage';

/** Virtual scene ID used when the user navigates to a page still being generated. */
export const PENDING_SCENE_ID = '__pending__';

interface StageState {
  stage: StageResponse | null;
  scenes: Scene[];
  currentSceneId: string | null;
  generatingOutlines: SceneOutline[];
  outlines: SceneOutline[];

  setStage: (stage: StageResponse) => void;
  setScenes: (scenes: Scene[]) => void;
  setCurrentSceneId: (sceneId: string | null) => void;
  setGeneratingOutlines: (outlines: SceneOutline[]) => void;
  setOutlines: (outlines: SceneOutline[]) => void;
  getCurrentScene: () => Scene | null;
  getSceneById: (sceneId: string) => Scene | null;
  getSceneIndex: (sceneId: string) => number;
  clearStore: () => void;
}

const useStageStoreBase = create<StageState>()((set, get) => ({
  stage: null,
  scenes: [],
  currentSceneId: null,
  generatingOutlines: [],
  outlines: [],

  setStage: (stage) =>
    set({
      stage,
      scenes: [],
      currentSceneId: null,
      generatingOutlines: [],
      outlines: [],
    }),

  setScenes: (scenes) =>
    set((state) => {
      const currentSceneIsAvailable =
        state.currentSceneId === PENDING_SCENE_ID ||
        scenes.some((scene) => scene.id === state.currentSceneId);

      return {
        scenes,
        currentSceneId: currentSceneIsAvailable
          ? state.currentSceneId
          : (scenes[0]?.id ?? null),
      };
    }),

  setCurrentSceneId: (currentSceneId) => set({ currentSceneId }),
  setGeneratingOutlines: (generatingOutlines) => set({ generatingOutlines }),
  setOutlines: (outlines) => set({ outlines }),

  getCurrentScene: () => {
    const { scenes, currentSceneId } = get();
    if (!currentSceneId) return null;
    return scenes.find((scene) => scene.id === currentSceneId) ?? null;
  },

  getSceneById: (sceneId) => get().scenes.find((scene) => scene.id === sceneId) ?? null,
  getSceneIndex: (sceneId) => get().scenes.findIndex((scene) => scene.id === sceneId),

  clearStore: () =>
    set({
      stage: null,
      scenes: [],
      currentSceneId: null,
      generatingOutlines: [],
      outlines: [],
    }),
}));

export const useStageStore = createSelectors(useStageStoreBase);
