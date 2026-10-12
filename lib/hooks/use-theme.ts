"use client";

import { useThemeContext } from "@/components/providers/theme-provider";

export function useTheme() {
  const { theme, setTheme, mounted } = useThemeContext();
  return { theme, setTheme, mounted };
}
