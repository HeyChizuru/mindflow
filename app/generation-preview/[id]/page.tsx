'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OutlinesEditor } from '@/components/generation-preview/outlines-editor';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ALL_STEPS } from './types';
import { StepVisualizer } from './components/visualizers';
import { useStaticOutlineMock } from './use-static-outline-mock';

/**
 * 生成页的大纲壳。
 * 只渲染大纲一步的卡片和编辑器；不读 sessionStorage，不请求大纲接口。
 */
export default function GenerationPreviewPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { outlines, setOutlines, isStreaming } = useStaticOutlineMock();
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outlineStep = ALL_STEPS[0];

  const goBackToHome = () => {
    router.push('/');
  };

  if (editorOpen) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 relative overflow-hidden">
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
                {t('generation.reviewOutlineTitle')}
              </h2>
              <p className="text-muted-foreground text-sm md:text-base">
                {isStreaming
                  ? t('generation.reviewOutlineStreamingDesc')
                  : t('generation.reviewOutlineDesc')}
              </p>
            </div>

            {error && (
              <div className="mx-auto max-w-2xl rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <OutlinesEditor
              outlines={outlines}
              onChange={setOutlines}
              onBack={goBackToHome}
              onCollapse={() => setEditorOpen(false)}
              isStreaming={isStreaming}
            />
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
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
              {ALL_STEPS.map((step) => (
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
                      key={outlineStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={outlineStep.id}
                        outlines={outlines}
                        onExpandOutline={() => setEditorOpen(true)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3 max-w-sm mx-auto">
                <h2 className="text-2xl font-bold tracking-tight">
                  {error ? t('generation.generationFailed') : t(outlineStep.title)}
                </h2>
                <p className="text-muted-foreground text-base">
                  {error ?? t(outlineStep.description)}
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
              onClick={() => setError(null)}
            >
              {t('generation.goBackAndRetry')}
            </Button>
          ) : isStreaming ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest">
              <Sparkles className="size-3 animate-pulse" />
              {t('generation.aiWorking')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
