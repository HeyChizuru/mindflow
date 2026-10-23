'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, CircleHelp, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ClassroomDirectoryEntry } from '@/lib/types/classroom';

export function SceneSidebar({ directory, currentSceneId, collapsed, onCollapseChange, onSceneSelect }: {
  directory: ClassroomDirectoryEntry[]; currentSceneId: string | null; collapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  onSceneSelect: (sceneId: string | null, outlineId: string) => void;
}) {
  const { t } = useI18n();
  if (collapsed) return null;
  return <aside aria-label={t('classroom.outline')} className="absolute inset-y-0 left-0 z-30 flex w-64 max-w-[85vw] flex-col border-r bg-sidebar text-sidebar-foreground shadow-lg md:static md:w-60 md:shrink-0 md:shadow-none">
    <div className="flex items-center justify-between gap-2 p-4">
      <Link href="/" aria-label={t('generation.backToHome')}>
        <Image src="/mindflow-logo.svg" alt="MindFlow" width={123} height={32} unoptimized className="h-8 w-auto dark:hidden" />
        <Image src="/mindflow-logo-dark.svg" alt="MindFlow" width={123} height={32} unoptimized className="hidden h-8 w-auto dark:block" />
      </Link>
      <Button size="icon" variant="ghost" aria-label={t('classroom.collapseOutline')} onClick={() => onCollapseChange(true)}><PanelLeftClose /></Button>
    </div>
    <h2 className="px-4 py-2 text-sm font-semibold">{t('classroom.outline')}</h2>
    <nav data-testid="scene-list" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      {directory.map((entry, index) => {
        const active = entry.sceneId !== null && entry.sceneId === currentSceneId;
        const Icon = entry.type === 'quiz' ? CircleHelp : BookOpen;
        return <button type="button" key={entry.outlineId} data-testid="scene-item" aria-current={active ? 'step' : undefined}
          aria-label={entry.title + '，' + t(entry.ready ? 'classroom.ready' : 'classroom.notReady')}
          onClick={() => onSceneSelect(entry.sceneId, entry.outlineId)}
          className={cn('flex w-full items-start gap-2 rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground' : 'border-transparent hover:bg-sidebar-accent')}>
          <span className="text-xs tabular-nums">{String(index + 1).padStart(2, '0')}</span>
          <Icon className="mt-0.5 size-4 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span data-testid="scene-title" className="break-words text-sm font-medium">{entry.title}</span>
            <Badge variant={entry.ready ? 'secondary' : 'outline'}>{t(entry.ready ? 'classroom.ready' : 'classroom.notReady')}</Badge>
          </span>
        </button>;
      })}
    </nav>
  </aside>;
}
