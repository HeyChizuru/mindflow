'use client';

import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CircleCheck, CircleDashed, CircleAlert } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ClassroomNotice, PageState } from './classroom-view-types';
import type { BackgroundGenerationState } from '@/lib/types/stage-generation';

type GenerationStatusProps = {
  state: BackgroundGenerationState; ready: number; total: number; onRetry?: () => void;
};

function GenerationDetails({ state, onRetry }: Pick<GenerationStatusProps, 'state' | 'onRetry'>) {
  const { t } = useI18n();
  return <div className="flex w-full min-w-0 flex-col gap-2 [overflow-wrap:anywhere]">
      {state.target && <span>{t('background.target', { title: state.target.title })}</span>}
      {state.phase === 'failed' ? <>
        <span>{t('background.failedStep', { step: t('background.step.' + (state.failedStep ?? 'reading')) })}</span>
        <span>{state.error ?? t('background.reason.' + state.reason)}</span>
        <Button variant="outline" size="sm" className="self-start" disabled={!onRetry} onClick={onRetry}>
          {t(state.recovery === 'read' ? 'background.readAndContinue' : 'background.retry')}
        </Button>
      </> : <span>{t(state.phase === 'complete' ? 'background.completeHint' : 'background.runningHint')}</span>}
    </div>;
}

export function BackgroundGenerationNotice({ state, ready, total, onRetry }: GenerationStatusProps) {
  const { t } = useI18n();
  if (state.phase === 'idle') return null;
  const Icon = state.phase === 'failed' ? CircleAlert : state.phase === 'complete' ? CircleCheck : CircleDashed;
  return <Alert role="group" aria-label={t('background.title')} data-testid="background-generation"
    variant={state.phase === 'failed' ? 'destructive' : 'default'} className="min-w-0 [overflow-wrap:anywhere]">
    <Icon aria-hidden="true" />
    <AlertTitle className="flex min-w-0 flex-wrap items-center gap-2">
      <span>{t('background.title')}</span><Badge variant="secondary">{t('background.count', { ready, total })}</Badge>
    </AlertTitle>
    <AlertDescription className="flex min-w-0 flex-col gap-2">
      <span>{t('background.phase.' + state.phase)}</span>
      <GenerationDetails state={state} onRetry={onRetry} />
    </AlertDescription>
  </Alert>;
}

export function BackgroundGenerationFailure({ state, onRetry }: Pick<GenerationStatusProps, 'state' | 'onRetry'>) {
  const { t } = useI18n();
  if (state.phase !== 'failed') return null;
  return <Alert role="group" variant="destructive" aria-label={t('background.phase.failed')} data-testid="background-generation-failure">
    <CircleAlert aria-hidden="true" />
    <AlertTitle>{t('background.phase.failed')}</AlertTitle>
    <AlertDescription><GenerationDetails state={state} onRetry={onRetry} /></AlertDescription>
  </Alert>;
}

export function BackgroundGenerationAnnouncement({ state, ready, total }: GenerationStatusProps) {
  const { t } = useI18n();
  const message = state.phase === 'idle' ? '' : [t('background.phase.' + state.phase), t('background.count', { ready, total }),
    state.target ? t('background.target', { title: state.target.title }) : '',
    state.phase === 'failed' ? t('background.failedStep', { step: t('background.step.' + (state.failedStep ?? 'reading')) }) : '',
    state.phase === 'failed' ? state.error ?? t('background.reason.' + state.reason) : '',
  ].filter(Boolean).join('。');
  return <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="background-generation-announcement">{message}</div>;
}

export function ClassroomNoticeView({ notice }: { notice: ClassroomNotice }) {
  return <Alert role="status">
    <AlertTitle>{notice.title}</AlertTitle>
    <AlertDescription className="flex flex-wrap items-center gap-2">
      <span>{notice.message}</span>
      {notice.onAction && <Button variant="outline" size="sm" onClick={notice.onAction}>{notice.actionLabel}</Button>}
    </AlertDescription>
  </Alert>;
}

export function ClassroomStatus({ state, generationUrl, onRead }: {
  state: Exclude<PageState, 'ready'>; generationUrl?: string; onRead?: () => void;
}) {
  const { t } = useI18n();
  if (state === 'loading') return <div role="status" aria-label={t('classroom.loading')} className="m-auto flex w-full max-w-lg flex-col gap-4 p-6">
    <Skeleton className="h-6 w-2/3" /><Skeleton className="h-48 w-full" /><span>{t('classroom.loading')}</span>
  </div>;
  return <Empty className="m-auto">
    <EmptyHeader><EmptyTitle>{t('classroom.state.' + state)}</EmptyTitle><EmptyDescription>{t('classroom.stateHint.' + state)}</EmptyDescription></EmptyHeader>
    <EmptyContent>
      {(state === 'draft' || state === 'first_scene_pending') && generationUrl &&
        <Button asChild variant="action"><Link href={generationUrl}>{t('classroom.backGeneration')}</Link></Button>}
      {state === 'read_failed' && <Button onClick={onRead} disabled={!onRead}>{t('classroom.retryRead')}</Button>}
      <Button asChild variant="outline"><Link href="/">{t('generation.backToHome')}</Link></Button>
    </EmptyContent>
  </Empty>;
}
