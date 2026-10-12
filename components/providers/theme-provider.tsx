"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ThemeSetting = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemeSetting;
  setTheme: (theme: ThemeSetting) => void;
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "theme";

const themeListeners = new Set<() => void>();

function emitThemeChange() {
  themeListeners.forEach((listener) => listener());
}

function subscribeTheme(onStoreChange: () => void) {
  themeListeners.add(onStoreChange);
  return () => themeListeners.delete(onStoreChange);
}

function isThemeSetting(value: string | null): value is ThemeSetting {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): ThemeSetting {
  if (typeof window === "undefined") return "system";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isThemeSetting(saved)) return saved;
  } catch {
    /* ignore */
  }
  return "system";
}

function getServerThemeSnapshot(): ThemeSetting {
  return "system";
}

function resolveTheme(setting: ThemeSetting): "light" | "dark" {
  if (setting === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return setting;
}

function applyTheme(setting: ThemeSetting) {
  const resolved = resolveTheme(setting);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
}

function getClientMountedSnapshot() {
  return true;
}

function getServerMountedSnapshot() {
  return false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readStoredTheme,
    getServerThemeSnapshot,
  );
  const mounted = useSyncExternalStore(
    () => () => {},
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemeSetting) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
    emitThemeChange();
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, mounted }),
    [theme, setTheme, mounted],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
