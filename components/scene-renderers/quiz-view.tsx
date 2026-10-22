'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Check,
  BookOpenText,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { QuizQuestion } from '@/lib/types/scene';
import type { QuestionResult } from '@/lib/quiz/grading';
import { Button } from '@/components/ui/button';

type ChoiceQuestion = Extract<QuizQuestion, { type: 'single' | 'multiple' }>;
type ShortQuestion = Extract<QuizQuestion, { type: 'short_answer' }>;

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = 'not_started' | 'answering';

interface QuizViewProps {
  readonly questions: QuizQuestion[];
  readonly sceneId: string;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function QuizCover({
  questionCount,
  totalPoints,
  onStart,
}: {
  questionCount: number;
  totalPoints: number;
  onStart: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 p-6 opacity-[0.03]">
        <PieChart className="w-52 h-52 text-violet-500" />
      </div>
      <div className="absolute bottom-0 left-0 p-6 opacity-[0.02]">
        <BookOpenText className="w-40 h-40 text-violet-500 rotate-12" />
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-50 dark:from-violet-900/50 dark:to-purple-900/30 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-100 dark:shadow-violet-900/30 ring-1 ring-violet-200/50 dark:ring-violet-700/50"
      >
        <PieChart className="w-8 h-8 text-violet-500" />
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-center z-10"
      >
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t('quiz.title')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('quiz.subtitle')}</p>
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-5 text-sm z-10"
      >
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
            <BookOpenText className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <span>
            {questionCount} {t('quiz.questionsCount')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
            <PieChart className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <span>
            {t('quiz.totalPrefix')} {totalPoints} {t('quiz.pointsSuffix')}
          </span>
        </div>
      </motion.div>

      <motion.button
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onStart}
        className="mt-1 px-8 py-2.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-full font-medium shadow-lg shadow-violet-200/50 dark:shadow-violet-900/50 hover:shadow-violet-300/50 transition-shadow z-10 flex items-center gap-2"
      >
        {t('quiz.startQuiz')}
        <ChevronRight className="w-4 h-4" />
      </motion.button>
    </div>
  );
}

function SingleChoiceQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
}: {
  question: ChoiceQuestion;
  index: number;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  result?: QuestionResult;
}) {
  const isReview = !!result;

  return (
    <QuestionCard question={question} index={index} result={result}>
      <div className="grid gap-2">
        {question.options?.map((opt) => {
          const selected = value === opt.value;
          const isCorrectOpt = isReview && question.answer?.includes(opt.value);
          const isWrong = isReview && selected && result?.status === 'incorrect';

          return (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => !disabled && onChange(opt.value)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm',
                // Default state
                !isReview &&
                  !selected &&
                  'border-gray-200 dark:border-gray-600 hover:border-violet-200 dark:hover:border-violet-700 hover:bg-violet-50/50 dark:hover:bg-violet-900/30',
                !isReview &&
                  selected &&
                  'border-violet-400 bg-violet-50 dark:bg-violet-900/30 ring-1 ring-violet-200 dark:ring-violet-700',
                // Review states
                isReview &&
                  isCorrectOpt &&
                  'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
                isReview &&
                  isWrong &&
                  !isCorrectOpt &&
                  'border-red-300 bg-red-50 dark:bg-red-900/30',
                isReview &&
                  !isCorrectOpt &&
                  !selected &&
                  'border-gray-100 dark:border-gray-700 opacity-60',
                disabled && !isReview && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                  !isReview &&
                    !selected &&
                    'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                  !isReview && selected && 'bg-violet-500 text-white',
                  isReview && isCorrectOpt && 'bg-emerald-500 text-white',
                  isReview && isWrong && !isCorrectOpt && 'bg-red-400 text-white',
                  isReview &&
                    !isCorrectOpt &&
                    !selected &&
                    'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
                )}
              >
                {opt.value}
              </span>
              <span
                className={cn(
                  'flex-1',
                  isReview && !isCorrectOpt && !selected && 'text-gray-400 dark:text-gray-500',
                )}
              >
                {opt.label}
              </span>
              {isReview && isCorrectOpt && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
              {isReview && isWrong && !isCorrectOpt && (
                <XCircle className="w-5 h-5 text-red-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </QuestionCard>
  );
}

function MultipleChoiceQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
}: {
  question: ChoiceQuestion;
  index: number;
  value?: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  result?: QuestionResult;
}) {
  const isReview = !!result;
  const selected = value ?? [];

  const toggle = (optValue: string) => {
    if (disabled) return;
    if (selected.includes(optValue)) {
      onChange(selected.filter((v) => v !== optValue));
    } else {
      onChange([...selected, optValue]);
    }
  };

  const { t } = useI18n();

  return (
    <QuestionCard question={question} index={index} result={result}>
      {!isReview && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          {t('quiz.multipleChoiceHint')}
        </p>
      )}
      <div className="grid gap-2">
        {question.options?.map((opt) => {
          const isSelected = selected.includes(opt.value);
          const isCorrectOpt = isReview && question.answer?.includes(opt.value);
          const isWrong = isReview && isSelected && !isCorrectOpt;

          return (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => toggle(opt.value)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm',
                !isReview &&
                  !isSelected &&
                  'border-gray-200 dark:border-gray-600 hover:border-violet-200 dark:hover:border-violet-700 hover:bg-violet-50/50 dark:hover:bg-violet-900/30',
                !isReview &&
                  isSelected &&
                  'border-violet-400 bg-violet-50 dark:bg-violet-900/30 ring-1 ring-violet-200 dark:ring-violet-700',
                isReview &&
                  isCorrectOpt &&
                  'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
                isReview && isWrong && 'border-red-300 bg-red-50 dark:bg-red-900/30',
                isReview &&
                  !isCorrectOpt &&
                  !isSelected &&
                  'border-gray-100 dark:border-gray-700 opacity-60',
                disabled && !isReview && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                  !isReview &&
                    !isSelected &&
                    'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                  !isReview && isSelected && 'bg-violet-500 text-white',
                  isReview && isCorrectOpt && 'bg-emerald-500 text-white',
                  isReview && isWrong && 'bg-red-400 text-white',
                  isReview &&
                    !isCorrectOpt &&
                    !isSelected &&
                    'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
                )}
              >
                {!isReview && isSelected ? <Check className="w-3.5 h-3.5" /> : opt.value}
              </span>
              <span
                className={cn(
                  'flex-1',
                  isReview && !isCorrectOpt && !isSelected && 'text-gray-400 dark:text-gray-500',
                )}
              >
                {opt.label}
              </span>
              {isReview && isCorrectOpt && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
              {isReview && isWrong && <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </QuestionCard>
  );
}

function ShortAnswerQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
}: {
  question: ShortQuestion;
  index: number;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  result?: QuestionResult;
}) {
  const isReview = !!result;
  const { t } = useI18n();

  return (
    <QuestionCard question={question} index={index} result={result}>
      {!isReview ? (
        <div className="relative">
          <textarea
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={t('quiz.inputPlaceholder')}
            className="w-full min-h-[100px] p-3 pb-10 rounded-xl border border-gray-200 dark:border-gray-600 text-sm resize-none focus:outline-none focus:border-violet-300 dark:focus:border-violet-600 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/50 transition-all disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:bg-gray-800/50 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <span className="absolute bottom-3 right-3 text-xs text-gray-300 dark:text-gray-600">
            {(value ?? '').length} {t('quiz.charCount')}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t('quiz.yourAnswer')}</p>
            {value || (
              <span className="text-gray-400 dark:text-gray-500 italic">
                {t('quiz.notAnswered')}
              </span>
            )}
          </div>
          {result.aiComment && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-900/30 border border-violet-100 dark:border-violet-800">
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400 mb-0.5">
                  {t('quiz.aiComment')}
                </p>
                <p className="text-xs text-violet-600/80 dark:text-violet-400/80">
                  {result.aiComment}
                </p>
              </div>
              <span className="ml-auto text-xs font-bold text-violet-600 dark:text-violet-400 shrink-0">
                {result.earned}/{question.points ?? 1}
                {t('quiz.pointsSuffix')}
              </span>
            </div>
          )}
        </div>
      )}
    </QuestionCard>
  );
}

function QuestionCard({
  question,
  index,
  result,
  children,
}: {
  question: QuizQuestion;
  index: number;
  result?: QuestionResult;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const isReview = !!result;
  const pts = question.points ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-2xl border p-5 relative overflow-hidden',
        !isReview && 'border-gray-150 dark:border-gray-700 shadow-sm',
        isReview &&
          result.status === 'correct' &&
          'border-emerald-200 dark:border-emerald-800 shadow-sm shadow-emerald-50 dark:shadow-emerald-900/20',
        isReview &&
          result.status === 'incorrect' &&
          'border-red-200 dark:border-red-800 shadow-sm shadow-red-50 dark:shadow-red-900/20',
      )}
    >
      {/* Left accent */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl',
          !isReview && 'bg-violet-400',
          isReview && result.status === 'correct' && 'bg-emerald-400',
          isReview && result.status === 'incorrect' && 'bg-red-400',
        )}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
              !isReview &&
                'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
              isReview &&
                result.status === 'correct' &&
                'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
              isReview &&
                result.status === 'incorrect' &&
                'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
            )}
          >
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
              {question.question}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {question.type === 'single'
                ? t('quiz.singleChoice')
                : question.type === 'multiple'
                  ? t('quiz.multipleChoice')
                  : t('quiz.shortAnswer')}
              {' · '}
              {pts} {t('quiz.pointsSuffix')}
            </p>
          </div>
        </div>
        {isReview && (
          <div className="shrink-0 ml-2">
            {result.status === 'correct' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
            {result.status === 'incorrect' && <XCircle className="w-6 h-6 text-red-400" />}
          </div>
        )}
      </div>

      {/* Body */}
      {children}

      {/* Analysis (review only) */}
      {isReview && question.analysis && (
        <div className="mt-3 p-3 rounded-lg bg-blue-50/70 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          <span className="font-medium">{t('quiz.analysis')}</span>
          {question.analysis}
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function QuizView({ questions, sceneId }: QuizViewProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('not_started');
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const totalPoints = useMemo(
    () => questions.reduce((sum, question) => sum + question.points, 0),
    [questions],
  );
  const handleSetAnswer = useCallback((questionId: string, value: string | string[]) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }, []);

  return (
    <div data-scene-id={sceneId} className="flex h-full w-full flex-col overflow-hidden bg-background">
      <AnimatePresence mode="wait">
        {phase === 'not_started' ? (
          <motion.div
            key="cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1"
          >
            <QuizCover
              questionCount={questions.length}
              totalPoints={totalPoints}
              onStart={() => setPhase('answering')}
            />
          </motion.div>
        ) : (
          <motion.div
            key="answering"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3">
              <p className="text-sm font-semibold">{t('quiz.answering')}</p>
              <Button type="button" disabled aria-describedby="quiz-submit-unavailable">
                {t('quiz.submitUnavailable')}
              </Button>
            </div>
            <p id="quiz-submit-unavailable" role="status" className="px-6 py-3 text-sm text-muted-foreground">
              {t('quiz.submitUnavailableHint')}
            </p>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
              {questions.map((question, index) => {
                const value = answers[question.id];
                if (question.type === 'single') {
                  return (
                    <SingleChoiceQuestion
                      key={question.id}
                      question={question}
                      index={index}
                      value={typeof value === 'string' ? value : undefined}
                      onChange={(answer) => handleSetAnswer(question.id, answer)}
                    />
                  );
                }
                if (question.type === 'multiple') {
                  return (
                    <MultipleChoiceQuestion
                      key={question.id}
                      question={question}
                      index={index}
                      value={Array.isArray(value) ? value : undefined}
                      onChange={(answer) => handleSetAnswer(question.id, answer)}
                    />
                  );
                }
                if (question.type === 'short_answer') {
                  return (
                    <ShortAnswerQuestion
                      key={question.id}
                      question={question}
                      index={index}
                      value={typeof value === 'string' ? value : undefined}
                      onChange={(answer) => handleSetAnswer(question.id, answer)}
                    />
                  );
                }
                return <p key={question.id} role="status">{t('quiz.unsupportedQuestion')}</p>;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
