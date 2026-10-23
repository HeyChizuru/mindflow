'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStageStore } from '@/lib/store/stage';
import type { Scene } from '@/lib/types/scene';

interface SceneContextValue<T = unknown> {
  sceneId: string;
  sceneType: Scene['type'];
  sceneData: T;
}
const SceneContext = createContext<SceneContextValue | null>(null);

/** Explicit read-only scenes support previews without seeding the classroom store. */
export function SceneProvider({ scene, children }: { scene?: Scene; children: ReactNode }) {
  const currentScene = useStageStore((state) => scene ?? state.scenes.find((item) => item.id === state.currentSceneId));
  const value = useMemo(() => currentScene ? {
    sceneId: currentScene.id, sceneType: currentScene.type, sceneData: currentScene.content,
  } : null, [currentScene]);
  if (!value) return null;
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export function useSceneData<T = unknown>(): SceneContextValue<T> {
  const context = useContext(SceneContext);
  if (!context) throw new Error('useSceneData must be used within SceneProvider');
  return context as SceneContextValue<T>;
}

export function useSceneSelector<T = unknown, R = unknown>(selector: (data: T) => R): R {
  return selector(useSceneData<T>().sceneData);
}
