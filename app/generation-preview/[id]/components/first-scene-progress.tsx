'use client';

import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { SceneOutline } from '@/lib/types/outline';
import { ALL_STEPS, type FirstScenePhase } from '../types';
import { StepVisualizer } from './visualizers';

export function FirstSceneProgress({ phase, sceneType, onRetry, onViewOutline }: {
  phase: FirstScenePhase;
  sceneType: SceneOutline['type'];
  onRetry: () => void;
  onViewOutline: () => void;
}) {
  const { t } = useI18n();
  const isComplete = phase.step === 'complete';
  const isError = phase.step === 'error';
  const isReading = phase.step === 'reading';
  const failedRead = isError && phase.failedStep === 'reading';
  const activeId = isError ? phase.failedStep : phase.step;
  const activeIndex = Math.max(1, ALL_STEPS.findIndex((step) => step.id === activeId));
  const stepLabels = ['generation.stepOutline', 'generation.stepContent', 'generation.stepActions'];
  const title = isError
    ? t(failedRead ? 'generation.firstSceneReadFailed' : phase.failedStep === 'slide-content' ? 'generation.firstContentFailed' : 'generation.firstActionsFailed')
    : t(isComplete ? 'generation.firstSceneComplete' : isReading ? 'generation.readingFirstScene' : ALL_STEPS[activeIndex].title);
  const description = isError ? phase.message ?? t('generation.firstSceneFailedDesc')
    : isComplete ? t('generation.firstSceneCompleteDesc')
    : isReading ? t('generation.readingFirstSceneDesc')
    : t(ALL_STEPS[activeIndex].description, { type: t(sceneType === 'quiz' ? 'generation.sceneTypeQuiz' : 'generation.sceneTypeSlide') });

  return (
    <>
      <section className="flex min-h-[440px] w-full flex-col items-center gap-7 rounded-xl border border-border/60 bg-card/80 px-6 py-8 text-center shadow-2xl backdrop-blur-xl sm:px-12" aria-label={title}>
        <ol className="flex w-full justify-center gap-4" aria-label={t('generation.progress')}>
          {ALL_STEPS.map((step, index) => (
            <li key={step.id} aria-current={!isComplete && index === activeIndex ? 'step' : undefined} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className={cn('h-1.5 w-8 rounded-full', index < activeIndex || isComplete ? 'bg-primary' : index === activeIndex ? isError ? 'bg-destructive' : 'bg-primary motion-safe:animate-pulse' : 'bg-muted')} />
              <span className={cn('text-xs', index === activeIndex || isComplete ? 'text-foreground' : 'text-muted-foreground')}>{t(stepLabels[index])}</span>
            </li>
          ))}
        </ol>
        <div className="relative flex size-56 items-center justify-center" aria-hidden="true">
          <AnimatePresence mode="wait">
            <motion.div key={phase.step} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.25 }}>
              {isError || isComplete ? (
                <div className={cn('flex size-32 items-center justify-center rounded-full border-2', isError ? 'border-destructive/20 bg-destructive/10 text-destructive' : 'border-primary/20 bg-primary/10 text-primary')}>
                  {isError ? <AlertCircle className="size-16" /> : <CheckCircle2 className="size-16" />}
                </div>
              ) : isReading ? <Loader2 className="size-16 text-primary motion-safe:animate-spin" />
                : <StepVisualizer stepId={activeId} sceneType={sceneType} />}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex max-w-sm flex-col gap-3" role={isError ? 'alert' : 'status'} aria-live="polite">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-base text-muted-foreground">{description}</p>
          {isError && !failedRead && phase.message && <p className="text-sm text-muted-foreground">{t('generation.firstSceneFailedDesc')}</p>}
        </div>
      </section>
      <div className="flex min-h-16 w-full flex-col items-center gap-3">
        {isError ? (
          <Button variant="action" size="lg" onClick={onRetry}>{t(failedRead ? 'generation.retryReadFirstScene' : 'generation.retryFirstScene')}</Button>
        ) : isComplete ? (
          <Button variant="action" size="lg" disabled>{t('generation.enterClassroom')}</Button>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="size-3 motion-safe:animate-pulse" />{t(isReading ? 'generation.readingFirstScene' : 'generation.aiWorking')}</p>
        )}
        <Button variant="ghost" size="sm" onClick={onViewOutline}>{t('generation.viewConfirmedOutline')}</Button>
      </div>
    </>
  );
}
