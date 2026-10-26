'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef } from 'react';
import { BookOpen, CircleHelp, CircleDashed, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BackgroundGenerationNotice } from './classroom-status';
import type { BackgroundGenerationState } from '@/lib/types/stage-generation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ClassroomDirectoryEntry } from '@/lib/types/classroom';

export function SceneSidebar({ directory, currentSceneId, collapsed, onCollapseChange, onSceneSelect, generation, onRetryGeneration }: {
  directory: ClassroomDirectoryEntry[]; currentSceneId: string | null; collapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  onSceneSelect: (sceneId: string | null, outlineId: string) => void;
  generation?: BackgroundGenerationState; onRetryGeneration?: () => void;
}) {
  const { t } = useI18n();
  const sidebar = useRef<HTMLElement>(null);
  const returnFocus = () => {
    if (sidebar.current?.contains(document.activeElement)) {
      sidebar.current.parentElement?.querySelector<HTMLButtonElement>('[data-testid="classroom-outline-toggle"]')?.focus();
    }
  };
  return <aside ref={sidebar} aria-label={t('classroom.outline')} aria-hidden={collapsed} inert={collapsed}
    className={cn('absolute inset-y-0 left-0 z-30 flex max-w-[85vw] flex-col overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none md:static md:shrink-0',
      collapsed ? 'w-0' : 'w-64 xl:w-72')}>
    <div className={cn('flex h-full w-64 shrink-0 flex-col border-r border-border/70 bg-sidebar/90 text-sidebar-foreground shadow-lg backdrop-blur-xl transition-transform duration-300 ease-in-out motion-reduce:transition-none md:shadow-none xl:w-72',
      collapsed ? '-translate-x-full' : 'translate-x-0')}>
      <div className="flex items-center justify-between gap-2 px-5 py-5">
        <Link href="/" aria-label={t('generation.backToHome')}>
          <Image src="/mindflow-logo.svg" alt="MindFlow" width={123} height={32} unoptimized className="h-8 w-auto dark:hidden" />
          <Image src="/mindflow-logo-dark.svg" alt="MindFlow" width={123} height={32} unoptimized className="hidden h-8 w-auto dark:block" />
        </Link>
        <Button size="icon" variant="ghost" aria-label={t('classroom.collapseOutline')} onClick={() => { returnFocus(); onCollapseChange(true); }}><PanelLeftClose /></Button>
      </div>
      <h2 className="px-5 pb-3 pt-3 text-xs font-medium tracking-wide text-muted-foreground">{t('classroom.outline')}</h2>
      {generation && generation.phase !== 'idle' && <>
        <div className="max-h-[30dvh] shrink-0 overflow-y-auto px-3 pb-3" tabIndex={0} aria-label={t('background.title')}>
          <BackgroundGenerationNotice state={generation} ready={directory.filter(entry => entry.ready).length}
            total={directory.length} onRetry={onRetryGeneration} />
        </div>
        <Separator className="mx-5 w-auto" />
      </>}
      <nav data-testid="scene-list" className="classroom-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-4 pt-2 text-foreground/85">
        {directory.map((entry, index) => {
          const active = entry.sceneId !== null && entry.sceneId === currentSceneId;
          const Icon = entry.type === 'quiz' ? CircleHelp : BookOpen;
          const targeted = !entry.ready && generation?.target?.outlineId === entry.outlineId && generation.phase !== 'idle' && generation.phase !== 'complete';
          const status = targeted ? t('background.item.' + generation.phase) : t(entry.ready ? 'classroom.ready' : 'classroom.notReady');
          return <button type="button" key={entry.outlineId} data-testid="scene-item" aria-current={active ? 'step' : undefined}
            aria-label={entry.title + '，' + status}
            onClick={() => {
              if (entry.ready && window.matchMedia('(max-width: 767px)').matches) returnFocus();
              onSceneSelect(entry.sceneId, entry.outlineId);
            }}
            title={!entry.ready ? t('classroom.sceneNotReadyHint') : entry.title}
            className={cn('relative flex w-full shrink-0 items-start gap-3 rounded-xl px-3 py-3 text-left outline-none transition-[color,background-color,box-shadow] duration-200 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-primary/12 ring-1 ring-inset ring-primary/15 before:bg-primary' : 'hover:bg-sidebar-accent/60')}>
            <span className={cn('pt-0.5 text-xs tabular-nums', active ? 'text-sidebar-primary' : 'text-muted-foreground')}>{String(index + 1).padStart(2, '0')}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span data-testid="scene-title" className="break-words text-sm font-medium leading-6">{entry.title}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <Badge variant={targeted && generation.phase === 'failed' ? 'destructive' : entry.ready ? 'ready' : 'pending'}>
                  {!entry.ready && <CircleDashed aria-hidden="true" />}<span>{status}</span>
                </Badge>
              </span>
            </span>
          </button>;
        })}
      </nav>
    </div>
  </aside>;
}
