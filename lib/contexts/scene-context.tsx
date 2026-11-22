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

type SceneProviderProps = {
  /** 传入时只读绑定该场景，不依赖课堂 store（用于预览等）。 */
  scene?: Scene;
  children: ReactNode;
};

/**
 * 为子树提供当前场景 id、类型与 content。
 * 无可用场景时不渲染 children。
 */
export function SceneProvider({ scene, children }: SceneProviderProps) {
  const currentScene = useStageStore((state) => scene ?? state.scenes.find((item) => item.id === state.currentSceneId));
  const value = useMemo(
    () => currentScene ? { sceneId: currentScene.id, sceneType: currentScene.type, sceneData: currentScene.content } : null,
    [currentScene],
  );

  if (!value) return null;
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

/** 读取场景上下文；必须在 SceneProvider 内使用。 */
export function useSceneData<T = unknown>(): SceneContextValue<T> {
  const context = useContext(SceneContext);
  if (!context) throw new Error('useSceneData must be used within SceneProvider');
  return context as SceneContextValue<T>;
}

/** 从 sceneData 中选取子结构，避免各组件重复断言 content 类型。 */
export function useSceneSelector<T = unknown, R = unknown>(selector: (data: T) => R): R {
  return selector(useSceneData<T>().sceneData);
}