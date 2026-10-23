'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { PlaybackDisplay } from './classroom-view-types';

export function PlaybackCaption({ playback, subtitle, discussion, onContinue }: {
  playback: PlaybackDisplay; subtitle?: string | null;
  discussion?: { topic: string; prompt?: string } | null; onContinue?: () => void;
}) {
  const { t } = useI18n();
  return <section aria-label={t('classroom.subtitle')} className="flex h-[clamp(8rem,18dvh,11rem)] max-h-[30dvh] shrink-0 flex-col border-t bg-background px-5 py-3 sm:px-8 sm:py-4">
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t('classroom.subtitle')}</span>
        <Badge variant="secondary">{t('classroom.playback.' + playback)}</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2" tabIndex={0} aria-label={t('classroom.captionContent')}>
        {discussion ? <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1"><p className="text-xs font-medium text-primary">{t('classroom.discussionPrompt')}</p><p className="whitespace-pre-wrap break-words text-base leading-7">{discussion.topic}</p>
            {discussion.prompt && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{discussion.prompt}</p>}</div>
          <Button onClick={onContinue} disabled={!onContinue}>{t('classroom.continueLecture')}</Button>
        </div> : <p aria-live="polite" className="whitespace-pre-wrap break-words text-base leading-7">{subtitle || t('classroom.subtitleWaiting')}</p>}
      </div>
    </div>
  </section>;
}
