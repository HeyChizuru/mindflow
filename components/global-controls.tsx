'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Settings, Sun } from 'lucide-react';
import { openModelSettings } from '@/lib/client/llm/settings';
import { useTheme } from '@/lib/hooks/use-theme';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export function GlobalControls({ chatOpen = false }: { chatOpen?: boolean }) {
  const { t } = useI18n();
  const { theme, setTheme, mounted: themeMounted } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!themeOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  return <div ref={toolbarRef}
    className={cn('fixed top-4 right-4 z-50 flex items-center gap-1 rounded-full border border-border/70 bg-card/70 px-2 py-1.5 shadow-sm backdrop-blur-md transition-[right] duration-300 ease-in-out motion-reduce:transition-none',
      chatOpen && 'right-[calc(min(28rem,70vw)_+_1rem)] lg:right-[calc(min(28rem,36vw)_+_1rem)]')}>
    <div className="relative">
      <button type="button" onClick={() => setThemeOpen(!themeOpen)}
        className="rounded-full p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-800 hover:shadow-sm dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200">
        {!themeMounted ? <Monitor className="h-4 w-4" aria-hidden /> : <>
          {theme === 'light' && <Sun className="h-4 w-4" />}
          {theme === 'dark' && <Moon className="h-4 w-4" />}
          {theme === 'system' && <Monitor className="h-4 w-4" />}
        </>}
      </button>
      {themeOpen && <div className="absolute top-full right-0 z-50 mt-2 min-w-[140px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
        <button type="button" onClick={() => { setTheme('light'); setThemeOpen(false); }}
          className={cn('flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
            theme === 'light' && 'bg-sky-500/10 text-blue-600 dark:bg-sky-500/15 dark:text-blue-400')}>
          <Sun className="h-4 w-4" />{t('settings.themeOptions.light')}
        </button>
        <button type="button" onClick={() => { setTheme('dark'); setThemeOpen(false); }}
          className={cn('flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
            theme === 'dark' && 'bg-sky-500/10 text-blue-600 dark:bg-sky-500/15 dark:text-blue-400')}>
          <Moon className="h-4 w-4" />{t('settings.themeOptions.dark')}
        </button>
        <button type="button" onClick={() => { setTheme('system'); setThemeOpen(false); }}
          className={cn('flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
            theme === 'system' && 'bg-sky-500/10 text-blue-600 dark:bg-sky-500/15 dark:text-blue-400')}>
          <Monitor className="h-4 w-4" />{t('settings.themeOptions.system')}
        </button>
      </div>}
    </div>
    <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
    <button type="button" onClick={() => { setThemeOpen(false); openModelSettings(); }}
      className="group rounded-full p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-800 hover:shadow-sm dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      aria-label="设置" title="设置">
      <Settings className="h-4 w-4 transition-transform duration-500 group-hover:rotate-90" />
    </button>
  </div>;
}
