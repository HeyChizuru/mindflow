'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { PlaybackDisplay } from './classroom-view-types';

export function PlaybackCaption({ playback, subtitle }: {
  playback: PlaybackDisplay; subtitle?: string | null;
}) {
  const { t } = useI18n();
  return <section aria-label={t('classroom.subtitle')} className="flex h-[clamp(8rem,18dvh,11rem)] max-h-[30dvh] shrink-0 flex-col border-t bg-background px-5 py-3 sm:px-8 sm:py-4">
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t('classroom.subtitle')}</span>
        <Badge variant="secondary">{t('classroom.playback.' + playback)}</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2" tabIndex={0} aria-label={t('classroom.captionContent')}>
        <p aria-live="polite" className="whitespace-pre-wrap break-words text-base leading-7">{subtitle || t('classroom.subtitleWaiting')}</p>
      </div>
    </div>
  </section>;
}
