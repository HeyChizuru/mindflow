'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { PlaybackDisplay } from './classroom-view-types';
import type { ReactNode } from 'react';

export function PlaybackCaption({ playback, subtitle, chatControl }: {
  playback: PlaybackDisplay; subtitle?: string | null; chatControl?: ReactNode;
}) {
  const { t } = useI18n();
  return <section aria-label={t('classroom.subtitle')} className="relative flex h-[clamp(8rem,18dvh,11rem)] max-h-[30dvh] shrink-0 flex-col border-t border-border/60 bg-card/40 px-5 py-3 backdrop-blur-xl sm:px-8 sm:py-4">
    {chatControl && <div className="absolute right-3 top-2 z-10">{chatControl}</div>}
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2 pr-12">
        <span className="text-xs text-muted-foreground">{t('classroom.subtitle')}</span>
        <Badge variant="secondary">{t('classroom.playback.' + playback)}</Badge>
      </div>
      <div className="classroom-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2" tabIndex={0} aria-label={t('classroom.captionContent')}>
        <p aria-live="polite" className="whitespace-pre-wrap break-words text-base leading-7">{subtitle || t('classroom.subtitleWaiting')}</p>
      </div>
    </div>
  </section>;
}
