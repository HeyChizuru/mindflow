'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { AlertCircle, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OutlinesEditor } from '@/components/generation-preview/outlines-editor';
import { streamSceneOutlines } from '@/lib/client/generate/stream-scene-outlines';
import { outlineRequestHeaders } from '@/lib/client/llm/dev-headers';
import { confirmOutlines, getGenerationPreview, generateFirstSceneContent, generateFirstSceneActions, StageGenerationRequestError } from '@/lib/client/generate/stage-generation';
import { getStage, GetStageError } from '@/lib/client/stages/get-stage';
import { formatUserProfile } from '@/lib/generation/prompt-formatters';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SceneOutline } from '@/lib/types/outline';
import type { ConfirmOutlinesResponse, GenerationPreviewResponse } from '@/lib/types/stage-generation';
import { sceneOutlinesSchema } from '@/lib/validators/outline';
import { ALL_STEPS, type FirstScenePhase } from './types';
import { StepVisualizer } from './components/visualizers';
import { FirstSceneProgress } from './components/first-scene-progress';

const STREAM_FAILED = '大纲生成失败，请重试';
type ConfirmedPreview = Extract<GenerationPreviewResponse, { outlinesStatus: 'confirmed' }>;

function requestMessage(error: unknown): string {
  return error instanceof StageGenerationRequestError || error instanceof GetStageError
    ? error.message : '读取或生成首屏失败，请重试';
}

export default function GenerationPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <LiveGenerationPreviewPage key={id} stageId={id} />;
}

function LiveGenerationPreviewPage({ stageId }: { stageId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [outlines, setOutlines] = useState<SceneOutline[]>([]);
  const [languageDirective, setLanguageDirective] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReading, setIsReading] = useState(true);
  const [streamCompleted, setStreamCompleted] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [hasKnowledgeBase, setHasKnowledgeBase] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const confirmationController = useRef<AbortController | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [firstScenePhase, setFirstScenePhase] = useState<FirstScenePhase>({ step: 'reading' });

  const restoreConfirmed = useCallback((saved: ConfirmOutlinesResponse) => {
    setOutlines(saved.outlines);
    setLanguageDirective(saved.languageDirective);
    setIsConfirmed(true);
    setIsStreaming(false);
    setIsReading(false);
    setEditorOpen(false);
    setIsConfirming(false);
    setError(null);
    setConfirmationError(null);
  }, []);

  const resumeFirstScene = useCallback(async (saved: ConfirmedPreview, signal: AbortSignal) => {
    if (signal.aborted) return;
    restoreConfirmed(saved);
    if (saved.firstScene) {
      setFirstScenePhase({ step: 'complete' });
      return;
    }
    let failedStep: 'reading' | 'slide-content' | 'actions' = 'reading';
    setFirstScenePhase({ step: 'reading' });
    try {
      const stage = await getStage(saved.stageId, signal);
      if (signal.aborted) return;
      const input = {
        stageId: saved.stageId,
        outline: saved.outlines[0],
        allOutlines: saved.outlines,
        requirement: stage.requirements.requirement,
        languageDirective: saved.languageDirective,
        userProfile: formatUserProfile(stage.requirements),
      };
      failedStep = 'slide-content';
      setFirstScenePhase({ step: 'slide-content' });
      const content = await generateFirstSceneContent(input, outlineRequestHeaders(saved.hasKnowledgeBase), signal);
      if (signal.aborted) return;
      failedStep = 'actions';
      setFirstScenePhase({ step: 'actions' });
      await generateFirstSceneActions({ ...input, outline: content.effectiveOutline, content: content.content, previousSpeeches: [] }, outlineRequestHeaders(false), signal);
      if (!signal.aborted) setFirstScenePhase({ step: 'complete' });
    } catch (caught) {
      if (signal.aborted) return;
      if (failedStep === 'reading') {
        setFirstScenePhase({ step: 'error', failedStep, message: requestMessage(caught) });
        return;
      }
      setFirstScenePhase({ step: 'reading' });
      try {
        const restored = await getGenerationPreview(saved.stageId, signal);
        if (signal.aborted) return;
        if (restored.outlinesStatus !== 'confirmed') throw new StageGenerationRequestError('课堂定稿状态异常，请重新读取');
        restoreConfirmed(restored);
        setFirstScenePhase(restored.firstScene ? { step: 'complete' }
          : { step: 'error', failedStep, message: requestMessage(caught) });
      } catch (readError) {
        if (!signal.aborted) setFirstScenePhase({ step: 'error', failedStep: 'reading', message: requestMessage(readError) });
      }
    }
  }, [restoreConfirmed]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function run() {
      await Promise.resolve();
      if (cancelled) return;
      setOutlines([]);
      setLanguageDirective(null);
      setError(null);
      setConfirmationError(null);
      setIsStreaming(false);
      setIsReading(true);
      setStreamCompleted(false);
      setIsConfirmed(false);
      setIsConfirming(false);
      setEditorOpen(false);
      setFirstScenePhase({ step: 'reading' });
      confirmationController.current = null;
      let startedStream = false;

      try {
        const stage = await getGenerationPreview(stageId, controller.signal);
        if (cancelled) return;
        setHasKnowledgeBase(stage.hasKnowledgeBase);
        if (stage.outlinesStatus === 'confirmed') {
          await resumeFirstScene(stage, controller.signal);
          return;
        }
        startedStream = true;
        setIsReading(false);
        setIsStreaming(true);
        await streamSceneOutlines(
          stage.stageId,
          outlineRequestHeaders(stage.hasKnowledgeBase),
          {
            onLanguageDirective: (directive) => {
              if (!cancelled) setLanguageDirective(directive);
            },
            onOutline: (outline) => {
              if (!cancelled) setOutlines((prev) => [...prev, outline]);
            },
            onRetry: () => {
              if (cancelled) return;
              setOutlines([]);
              setLanguageDirective(null);
            },
            onDone: (result) => {
              if (cancelled) return;
              setOutlines(result.outlines);
              setLanguageDirective(result.languageDirective);
              setStreamCompleted(true);
              setIsStreaming(false);
            },
          },
          controller.signal,
        );
      } catch (caught) {
        if (cancelled) return;
        if (startedStream) {
          try {
            const saved = await getGenerationPreview(stageId, controller.signal);
            if (cancelled) return;
            if (saved.outlinesStatus === 'confirmed') {
              await resumeFirstScene(saved, controller.signal);
              return;
            }
          } catch {
            if (cancelled) return;
          }
        }
        setIsReading(false);
        setIsStreaming(false);
        setEditorOpen(false);
        setError(caught instanceof Error ? caught.message : STREAM_FAILED);
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
      confirmationController.current?.abort();
    };
  }, [stageId, runId, resumeFirstScene]);

  const canConfirm = streamCompleted && !isReading && !isStreaming && !isConfirmed
    && sceneOutlinesSchema.safeParse(outlines).success;

  const handleConfirm = async () => {
    if (!canConfirm || isConfirming || confirmationController.current) return;
    const controller = new AbortController();
    confirmationController.current = controller;
    setIsConfirming(true);
    setConfirmationError(null);
    try {
      const saved = await confirmOutlines(
        stageId,
        { outlines, languageDirective, outlineStreamCompleted: true },
        outlineRequestHeaders(hasKnowledgeBase),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      restoreConfirmed(saved);
      setFirstScenePhase({ step: 'reading' });
      try {
        const preview = await getGenerationPreview(saved.stageId, controller.signal);
        if (controller.signal.aborted) return;
        if (preview.outlinesStatus !== 'confirmed') throw new StageGenerationRequestError('课堂定稿状态异常，请重新读取');
        await resumeFirstScene(preview, controller.signal);
      } catch (readError) {
        if (!controller.signal.aborted) setFirstScenePhase({ step: 'error', failedStep: 'reading', message: requestMessage(readError) });
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      try {
        const saved = await getGenerationPreview(stageId, controller.signal);
        if (controller.signal.aborted) return;
        if (saved.outlinesStatus === 'confirmed') {
          await resumeFirstScene(saved, controller.signal);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      setConfirmationError(caught instanceof Error ? caught.message : '确认大纲失败，请重试');
    } finally {
      if (!controller.signal.aborted) {
        setIsConfirming(false);
        confirmationController.current = null;
      }
    }
  };

  const goBackToHome = () => {
    router.push('/');
  };

  const enterClassroom = () => {
    router.push(`/classroom/${encodeURIComponent(stageId)}`);
  };

  const retry = () => {
    if (isConfirmed || isConfirming) return;
    setRunId((current) => current + 1);
  };

  const retryFirstScene = async () => {
    if (confirmationController.current || firstScenePhase.step !== 'error') return;
    const controller = new AbortController();
    confirmationController.current = controller;
    setFirstScenePhase({ step: 'reading' });
    try {
      const saved = await getGenerationPreview(stageId, controller.signal);
      if (controller.signal.aborted) return;
      if (saved.outlinesStatus !== 'confirmed') throw new StageGenerationRequestError('课堂定稿状态异常，请重新读取');
      await resumeFirstScene(saved, controller.signal);
    } catch (readError) {
      if (!controller.signal.aborted) setFirstScenePhase({ step: 'error', failedStep: 'reading', message: requestMessage(readError) });
    } finally {
      if (confirmationController.current === controller) confirmationController.current = null;
    }
  };

  if (isConfirmed && !editorOpen) {
    return (
      <MotionConfig reducedMotion="user">
        <div data-language-directive={languageDirective ?? ''} className="relative flex min-h-dvh w-full flex-col items-center overflow-x-hidden bg-gradient-to-b from-background to-muted p-4">
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="absolute left-1/4 top-0 size-96 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute bottom-0 right-1/4 size-96 rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div className="relative z-10 w-full">
            <Button variant="ghost" size="sm" onClick={goBackToHome}><ArrowLeft data-icon="inline-start" />{t('generation.backToHome')}</Button>
          </div>
          <div className="relative z-10 flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8 py-10">
            <FirstSceneProgress phase={firstScenePhase} sceneType={outlines[0].type} onRetry={retryFirstScene} onViewOutline={() => setEditorOpen(true)} onEnterClassroom={enterClassroom} />
          </div>
        </div>
      </MotionConfig>
    );
  }

  if (editorOpen) {
    return (
      <div
        data-language-directive={languageDirective ?? ''}
        className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 relative overflow-hidden"
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-4 z-20"
        >
          <Button variant="ghost" size="sm" onClick={goBackToHome} disabled={isConfirming}>
            <ArrowLeft className="size-4 mr-2" />
            {t('generation.backToHome')}
          </Button>
        </motion.div>

        <div className="z-10 w-full max-w-3xl pt-16 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex justify-center gap-2">
              <div className="h-1.5 w-8 rounded-full bg-blue-500" />
            </div>

            <div className="max-w-2xl space-y-2 text-center mx-auto">
              <h2 className="text-2xl font-bold tracking-tight">
                {t(isConfirmed ? 'generation.outlineConfirmed' : 'generation.reviewOutlineTitle')}
              </h2>
              <p className="text-muted-foreground text-sm md:text-base">
                {isConfirmed
                  ? t('generation.outlineConfirmedDesc')
                  : isStreaming
                    ? t('generation.reviewOutlineStreamingDesc')
                    : t('generation.reviewOutlineDesc')}
              </p>
            </div>

            {confirmationError && (
              <p role="alert" className="mx-auto max-w-2xl text-sm text-destructive">
                {confirmationError}
              </p>
            )}

            <OutlinesEditor
              outlines={outlines}
              onChange={(next) => {
                if (isConfirmed || isConfirming) return;
                setOutlines(next);
                setConfirmationError(null);
              }}
              onBack={goBackToHome}
              onCollapse={() => setEditorOpen(false)}
              isStreaming={isStreaming}
              isLoading={isConfirming}
              isReadOnly={isConfirmed}
              onConfirm={handleConfirm}
              confirmDisabled={!canConfirm}
            />
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-language-directive={languageDirective ?? ''}
      className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center"
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToHome}>
          <ArrowLeft className="size-4 mr-2" />
          {t('generation.backToHome')}
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <div className="relative overflow-hidden rounded-xl border border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12">
            <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
              {ALL_STEPS.slice(0, 1).map((step) => (
                <div key={step.id} className="h-1.5 w-8 rounded-full bg-blue-500" />
              ))}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
              <div className="relative size-48 flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {error ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={outlineStepKey(isStreaming)}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={ALL_STEPS[0].id}
                        outlines={outlines}
                        onExpandOutline={() => setEditorOpen(true)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3 max-w-sm mx-auto">
                <h2 className="text-2xl font-bold tracking-tight">
                  {error
                    ? t('generation.generationFailed')
                    : isReading
                      ? t('generation.readingOutline')
                    : isStreaming
                      ? t(ALL_STEPS[0].title)
                      : t('generation.reviewOutlineTitle')}
                </h2>
                <p className="text-muted-foreground text-base">
                  {error ??
                    (isReading
                      ? t('generation.readingOutlineDesc')
                      : isStreaming
                        ? t(ALL_STEPS[0].description)
                        : t('generation.reviewOutlineDesc'))}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="h-16 flex items-center justify-center w-full">
          {error ? (
            <Button
              size="lg"
              variant="outline"
              className="w-full max-w-xs h-12"
              onClick={retry}
            >
              {t('generation.goBackAndRetry')}
            </Button>
          ) : isStreaming ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest">
              <Sparkles className="size-3 animate-pulse" />
              {t('generation.aiWorking')}
            </div>
          ) : !isReading ? (
            <Button size="lg" onClick={() => setEditorOpen(true)}>
              {t('generation.reviewAndConfirmOutline')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function outlineStepKey(isStreaming: boolean): string {
  return isStreaming ? 'outline-streaming' : 'outline-ready';
}
