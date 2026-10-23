'use client';

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { TeachingEffect } from './classroom-view-types';

/** Teaching hints are text only and never apply state to answers or saved content. */
export function TeachingFeedback({ effects = [], targetId }: { effects?: TeachingEffect[]; targetId?: string }) {
  const { t } = useI18n();
  return <div className="flex flex-col gap-2">
    {effects.map((effect) => {
      if (effect.type === 'widget_annotation' && effect.target === targetId) return <Alert key={effect.id} role="note">
        <AlertTitle>{t('classroom.annotation')}</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{effect.content || t('classroom.emptyAnnotation')}</AlertDescription>
      </Alert>;
      if (effect.type === 'widget_setState' && !targetId) {
        const message = effect.state.message ?? effect.state.text ?? effect.state.status ?? (typeof effect.state.step === 'number' ? t('classroom.teachingStep', { count: effect.state.step }) : undefined);
        return <Alert key={effect.id} role="status"><AlertTitle>{t('classroom.teachingStatus')}</AlertTitle>
          <AlertDescription>{typeof message === 'string' ? message : t('classroom.unknownState')}</AlertDescription></Alert>;
      }
      return null;
    })}
  </div>;
}
