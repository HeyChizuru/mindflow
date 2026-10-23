'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { FieldSet, FieldLegend, FieldGroup, Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { TeachingFeedback } from '@/components/stage/teaching-feedback';
import type { QuizPresentation, TeachingEffect } from '@/components/stage/classroom-view-types';
import type { QuizAnswer } from '@/lib/types/classroom';
import type { QuizQuestion } from '@/lib/types/scene';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export function QuizView({ questions, sceneId, stageId, presentation, effects = [] }: {
  questions: QuizQuestion[]; sceneId: string; stageId: string; presentation?: QuizPresentation; effects?: TeachingEffect[];
}) {
  const { t } = useI18n();
  const [localDrafts, setLocalDrafts] = useState<Record<string, QuizAnswer>>({});
  const p = presentation;
  function change(id: string, answer: QuizAnswer) {
    if (p?.onChange) p.onChange(id, answer);
    else setLocalDrafts((current) => ({ ...current, [id]: answer }));
  }
  const missingEffects = effects.filter((effect) => 'target' in effect && !questions.some((question) => question.id === effect.target));
  return <section className="flex h-full min-h-0 flex-col" aria-label={t('quiz.title')} data-scene-id={sceneId}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-3">
      <div><h2 className="font-semibold">{t('quiz.title')}</h2><p className="text-xs text-muted-foreground">{t('quiz.perQuestionHint')}</p></div>
      <Button variant="outline" onClick={p?.onSkip} disabled={!p?.onSkip}>{t('quiz.skip')}</Button>
    </div>
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:px-6">
      <TeachingFeedback effects={effects} />
      {missingEffects.length > 0 && <Alert role="status"><AlertDescription>{t('classroom.effectTargetMissing')}</AlertDescription></Alert>}
      {questions.map((question, index) => {
        const display = p?.questions?.[question.id] ?? {};
        const candidate = display.record;
        const record = candidate?.stageId === stageId && candidate.sceneId === sceneId && candidate.questionId === question.id && candidate.answer.type === question.type ? candidate : undefined;
        const editing = !!display.editing;
        const value = editing || !record || !!display.issue ? display.draft ?? localDrafts[question.id] : record.answer;
        const busy = !!display.submitting || !!(record?.status === 'processing' && !record.executionExpired);
        const locked = busy || (!!record && !editing) || display.issue === 'conflict' || display.issue === 'unknown';
        const result = !editing && !display.issue && record?.status === 'completed' ? record.result : null;
        const valid = value?.type === question.type && (value.type === 'single' ? !!value.value : value.type === 'multiple' ? value.values.length > 0 : value.text.trim().length > 0);
        const domId = 'question-' + encodeURIComponent(stageId + '/' + sceneId + '/' + question.id);
        const status = display.issue ?? (display.submitting ? 'submitting' : editing ? 'redo' : record?.executionExpired ? 'expired' : record?.status ?? 'unsubmitted');
        const highlighted = effects.some((effect) => effect.type === 'widget_highlight' && effect.target === question.id);
        return <article key={domId} id={domId} tabIndex={-1}
          className={cn('flex scroll-mt-4 flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring', highlighted && 'ring-2 ring-primary')}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{t('quiz.questionNumber', { count: index + 1 })} · {question.points} {t('quiz.pointsSuffix')}</span><Badge variant="outline">{t('quiz.status.' + status)}</Badge></div>
          <FieldSet disabled={locked}>
            <FieldLegend id={domId + '-legend'}>{question.question}</FieldLegend>
            <FieldDescription>{t(question.type === 'single' ? 'quiz.singleChoice' : question.type === 'multiple' ? 'quiz.multipleChoice' : 'quiz.shortAnswer')}</FieldDescription>
            {question.type === 'single' ? <RadioGroup aria-labelledby={domId + '-legend'} disabled={locked}
              value={value?.type === 'single' ? value.value : ''} onValueChange={(answer) => change(question.id, { type: 'single', value: answer })}>
              {question.options.map((option) => <Field key={option.value} orientation="horizontal" data-disabled={locked}>
                <RadioGroupItem id={domId + '-' + option.value} value={option.value} disabled={locked} />
                <FieldLabel htmlFor={domId + '-' + option.value} className="min-w-0 break-words">{option.value}. {option.label}</FieldLabel>
              </Field>)}
            </RadioGroup> : question.type === 'multiple' ? <FieldGroup>
              {question.options.map((option) => <Field key={option.value} orientation="horizontal" data-disabled={locked}>
                <Checkbox id={domId + '-' + option.value} disabled={locked} checked={value?.type === 'multiple' && value.values.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const values = value?.type === 'multiple' ? value.values : [];
                    change(question.id, { type: 'multiple', values: checked === true ? [...values.filter((v) => v !== option.value), option.value] : values.filter((v) => v !== option.value) });
                  }} />
                <FieldLabel htmlFor={domId + '-' + option.value} className="min-w-0 break-words">{option.value}. {option.label}</FieldLabel>
              </Field>)}
            </FieldGroup> : <Field data-disabled={locked}>
              <FieldLabel htmlFor={domId + '-input'}>{t('quiz.yourAnswer')}</FieldLabel>
              <Textarea id={domId + '-input'} disabled={locked} value={value?.type === 'short_answer' ? value.text : ''}
                className="min-h-28" onChange={(event) => change(question.id, { type: 'short_answer', text: event.target.value })} placeholder={t('quiz.inputPlaceholder')} />
            </Field>}
          </FieldSet>
          <TeachingFeedback effects={effects} targetId={question.id} />
          {!editing && !display.issue && record && record.status !== 'completed' && <Alert role="status">
            <AlertTitle>{t('quiz.answerSaved')}</AlertTitle>
            <AlertDescription>{t(record.executionExpired ? 'quiz.expiredHint' : 'quiz.savedHint.' + record.status)}
              {record.failureCode && <p>{t('quiz.failure.' + record.failureCode)}</p>}
            </AlertDescription>
          </Alert>}
          {display.issue && <Alert variant="destructive" role="status"><AlertTitle>{t('quiz.status.' + display.issue)}</AlertTitle><AlertDescription>{t('quiz.issueHint.' + display.issue)}</AlertDescription></Alert>}
          {result && <Alert role="status">
            <AlertTitle>{t('quiz.score')}：{result.earned}/{result.points} {t('quiz.pointsSuffix')}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              {result.type === 'short_answer' ? <p>{t('quiz.aiComment')}：{result.comment}</p>
                : <><p>{t('quiz.correctAnswer')}：{result.correctAnswer.join('、')}</p><p>{t(result.correct ? 'quiz.correct' : 'quiz.incorrect')}</p></>}
              <p className="whitespace-pre-wrap break-words">{t('quiz.analysis')} {result.analysis}</p>
            </AlertDescription>
          </Alert>}
          <div className="flex flex-wrap gap-2">
            {(!record || editing) && <Button variant="action" disabled={!valid || busy || !!display.issue && display.issue !== 'unsaved' || !p?.onSubmit}
              onClick={() => p?.onSubmit?.(question.id)}>{t(display.submitting ? 'quiz.status.submitting' : 'quiz.submitQuestion')}</Button>}
            {editing && <Button variant="outline" disabled={busy || !p?.onCancel} onClick={() => p?.onCancel?.(question.id)}>{t('quiz.cancelRedo')}</Button>}
            {!editing && record && !busy && !display.issue && <Button variant="outline" disabled={!p?.onRedo} onClick={() => p?.onRedo?.(question.id)}>{t('quiz.redo')}</Button>}
            {!editing && record && !busy && !display.issue && record.status !== 'completed' && record.failureCode !== 'RESULT_SAVE_FAILED' &&
              <Button variant="outline" disabled={!p?.onRetry} onClick={() => p?.onRetry?.(question.id)}>{t('quiz.retryOriginal')}</Button>}
            {(display.issue === 'unknown' || display.issue === 'conflict' || record?.failureCode === 'RESULT_SAVE_FAILED' || record?.status === 'processing' && !record.executionExpired) && <Button variant="outline" disabled={!p?.onRead} onClick={() => p?.onRead?.(question.id)}>{t('quiz.readLatest')}</Button>}
          </div>
          {!p?.onSubmit && !record && <p className="text-xs text-muted-foreground">{t('quiz.submitUnavailableHint')}</p>}
        </article>;
      })}
    </div>
  </section>;
}
