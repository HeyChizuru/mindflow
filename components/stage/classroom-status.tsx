'use client';

import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ClassroomNotice, PageState } from './classroom-view-types';

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
