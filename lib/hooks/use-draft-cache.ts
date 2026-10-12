"use client";

import { useCallback, useSyncExternalStore } from "react";

const draftListeners = new Map<string, Set<() => void>>();

function subscribeDraft(key: string, onStoreChange: () => void) {
  let listeners = draftListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    draftListeners.set(key, listeners);
  }
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function emitDraftChange(key: string) {
  draftListeners.get(key)?.forEach((listener) => listener());
}

function readDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** 本地草稿读写（阶段 A/B 静态页）；以 localStorage 为外部 store */
export function useDraftCache<T extends string>(options: { key: string }) {
  const { key } = options;

  const cachedValue = useSyncExternalStore(
    (onStoreChange) => subscribeDraft(key, onStoreChange),
    () => readDraft(key),
    () => "",
  );

  const updateCache = useCallback(
    (value: T) => {
      try {
        if (value.trim()) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      emitDraftChange(key);
    },
    [key],
  );

  return { cachedValue, updateCache };
}
