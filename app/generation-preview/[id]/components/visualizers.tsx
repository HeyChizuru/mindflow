'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3,
  Clapperboard,
  MessageSquare,
  Focus,
  Play,
  Maximize2,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { SceneOutline } from '@/lib/types/outline';

// Step-specific visualizers
export function StepVisualizer({
  stepId,
  outlines,
  onExpandOutline,
}: {
  stepId: string;
  outlines?: SceneOutline[] | null;
  onExpandOutline?: () => void;
}) {
  switch (stepId) {
    case 'outline':
      return <StreamingOutlineVisualizer outlines={outlines || []} onExpand={onExpandOutline} />;
    case 'slide-content':
      return <ContentVisualizer />;
    case 'actions':
      return <ActionsVisualizer />;
    default:
      return null;
  }
}


// Outline: Streams real outline data as it arrives from SSE
function StreamingOutlineVisualizer({
  outlines,
  onExpand,
}: {
  outlines: SceneOutline[];
  onExpand?: () => void;
}) {
  const { t } = useI18n();
  const isInteractive = !!onExpand;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onExpand?.();
    }
  };

  return (
    <motion.div
      layoutId="outline-review-surface"
      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      // Slight tilt to suggest a tossed-down sticky note; straightens on hover.
      // Layout-shared morph into the editor surface explicitly targets rotate: 0,
      // so the rotation is interpolated as the surface grows.
      initial={isInteractive ? { rotate: -3 } : false}
      animate={isInteractive ? { rotate: -3 } : { rotate: 0 }}
      whileHover={isInteractive ? { y: -3, scale: 1.04, rotate: 0 } : undefined}
      whileTap={isInteractive ? { scale: 0.97, rotate: 0 } : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? t('generation.outlineExpandHint') : undefined}
      onClick={onExpand}
      onKeyDown={handleKeyDown}
      style={{ transformOrigin: 'center center' }}
      className={cn(
        'group/outline-card relative h-52 w-44 overflow-hidden rounded-2xl border p-3 text-left',
        'bg-white/90 shadow-xl shadow-slate-900/10 backdrop-blur',
        'dark:bg-slate-900/80',
        isInteractive
          ? 'cursor-pointer border-blue-400/40 shadow-blue-500/10 transition-shadow hover:border-blue-500/60 hover:shadow-2xl hover:shadow-blue-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-blue-400/30 dark:hover:border-blue-400/50'
          : 'border-slate-200/70 dark:border-white/10',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
        <motion.div
          className="size-2 rounded-full bg-blue-500"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.15, 0.9] }}
          transition={{ repeat: Infinity, duration: 1.1 }}
        />
      </div>

      <div className="relative h-[168px] overflow-hidden pl-4">
        {/* Spine sits at the dot's horizontal center: pl-4 (16px) - dot offset (-15px) + dot half (4px) = 5px */}
        <div className="absolute bottom-0 left-[5px] top-0 w-px bg-slate-200 dark:bg-slate-700" />
        <AnimatePresence initial={false}>
          {outlines.length === 0
            ? [58, 78, 48, 68].map((w, i) => (
              <motion.div
                key={i}
                className="relative mb-3"
                animate={{ opacity: [0.35, 0.75, 0.35] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.16 }}
              >
                <div className="absolute -left-[15px] top-0.5 size-2 rounded-full border border-blue-300 bg-white dark:bg-slate-900" />
                <div
                  className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"
                  style={{ width: `${w}%` }}
                />
                <div className="mt-1 h-1 w-2/3 rounded-full bg-slate-100 dark:bg-slate-800" />
              </motion.div>
            ))
            : outlines.slice(0, 4).map((outline, i) => (
              <motion.div
                key={outline.id}
                layout
                initial={{ opacity: 0, x: -10, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="relative mb-3"
              >
                <div className="absolute -left-[15px] top-0.5 size-2 rounded-full border border-blue-300 bg-white shadow-sm shadow-blue-500/20 dark:bg-slate-900" />
                <div className="truncate text-[9px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
                  {i + 1}. {outline.title}
                </div>
                <div className="mt-1 truncate text-[7px] leading-tight text-slate-400 dark:text-slate-500">
                  {outline.description || outline.keyPoints?.[0] || '...'}
                </div>
              </motion.div>
            ))}
        </AnimatePresence>

        {outlines.length > 4 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[8px] font-medium text-blue-500/70"
          >
            +{outlines.length - 4}
          </motion.div>
        )}
      </div>

      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-10 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-slate-900 dark:via-slate-900/80"
        aria-hidden
      />

      {/* Expand affordance — always visible to telegraph clickability */}
      {isInteractive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex items-center justify-center px-2">
          <motion.span
            className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white shadow-lg shadow-blue-500/50 backdrop-blur"
            animate={{ y: [0, -1.5, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Maximize2 className="size-3" />
            {t('generation.outlineExpandHint')}
          </motion.span>
        </div>
      )}

      {/* Subtle expand icon in top-right corner — pulses gently */}
      {isInteractive && (
        <motion.div
          className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-md text-blue-500/80 group-hover/outline-card:text-blue-600 dark:text-blue-400/80 dark:group-hover/outline-card:text-blue-300"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden
        >
          <Maximize2 className="size-3" />
        </motion.div>
      )}
    </motion.div>
  );
}

function ContentVisualizer() {
  const [index, setIndex] = useState(0);

  const totalTypes = 2;

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % totalTypes);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const variants = {
    enter: { x: 50, opacity: 0, scale: 0.9, rotateY: -15 },
    center: { x: 0, opacity: 1, scale: 1, rotateY: 0 },
    exit: { x: -50, opacity: 0, scale: 0.9, rotateY: 15 },
  };

  const getTheme = (idx: number) => {
    switch (idx) {
      case 0:
        return {
          color: 'blue',
          label: 'SLIDE',
          badge:
            'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
        };
      case 1:
        return {
          color: 'purple',
          label: 'QUIZ',
          badge:
            'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
        };
      default:
        return { color: 'blue', label: '', badge: '' };
    }
  };

  const theme = getTheme(index);

  return (
    <div className="size-56 relative flex items-center justify-center perspective-[800px]">
      {/* Background glow based on current theme */}
      <motion.div
        key={`glow-${index}`}
        className={cn(
          'absolute inset-0 blur-3xl rounded-full transition-colors duration-1000',
          theme.color === 'blue' && 'bg-blue-500/10',
          theme.color === 'purple' && 'bg-purple-500/10',
          theme.color === 'amber' && 'bg-amber-500/10',
          theme.color === 'emerald' && 'bg-emerald-500/10',
        )}
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      {/* Subtle orbiting rings (pushed back, slower) */}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className={cn(
            'absolute border rounded-full transition-colors duration-1000',
            theme.color === 'blue' && 'border-blue-500/10',
            theme.color === 'purple' && 'border-purple-500/10',
            theme.color === 'amber' && 'border-amber-500/10',
            theme.color === 'emerald' && 'border-emerald-500/10',
          )}
          style={{
            width: 180 + i * 50,
            height: 180 + i * 50,
            borderStyle: 'dashed',
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 40 + i * 15,
            ease: 'linear',
            repeat: Infinity,
            delay: i * -5,
          }}
        />
      ))}

      {/* Main Content Container */}
      <div className="w-40 h-28 relative">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={index}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 80, damping: 16 }}
            className={cn(
              'absolute inset-0 bg-white dark:bg-slate-800 rounded-xl border shadow-xl overflow-hidden flex flex-col p-3 origin-center',
              theme.color === 'blue' && 'border-blue-200 dark:border-blue-900/30',
              theme.color === 'purple' && 'border-purple-200 dark:border-purple-900/30',
              theme.color === 'amber' && 'border-amber-200 dark:border-amber-900/30',
              theme.color === 'emerald' && 'border-emerald-200 dark:border-emerald-900/30',
            )}
          >
            {/* Consistent Badge - Now outside content logic */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className={cn(
                'absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border backdrop-blur-md shadow-sm',
                theme.badge,
              )}
            >
              {theme.label}
            </motion.div>

            {/* --- SLIDE TYPE --- */}
            {index === 0 && (
              <div className="flex flex-col h-full pt-1">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '55%' }}
                  transition={{ delay: 0.2 }}
                  className="h-2 bg-blue-500/20 rounded-full mb-3 shrink-0"
                />
                <div className="flex gap-2 flex-1">
                  <div className="flex-1 space-y-2">
                    {[0.8, 0.9, 0.6, 0.7].map((w, i) => (
                      <motion.div
                        key={i}
                        initial={{ width: 0 }}
                        animate={{ width: `${w * 100}%` }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                        className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full"
                      />
                    ))}
                  </div>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0"
                  >
                    <BarChart3 className="size-6 text-blue-500/60" />
                  </motion.div>
                </div>
              </div>
            )}

            {/* --- QUIZ TYPE --- */}
            {index === 1 && (
              <div className="flex flex-col h-full justify-center space-y-2 pt-2">
                <motion.div
                  initial={{ y: -5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex justify-center mb-1"
                >
                  <div className="h-2 w-3/4 bg-purple-500/20 rounded-full" />
                </motion.div>

                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className={cn(
                        'h-6 rounded border flex items-center px-2',
                        i === 1
                          ? 'bg-purple-500 text-white border-purple-500'
                          : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-700',
                      )}
                    >
                      <div
                        className={cn(
                          'size-1.5 rounded-full mr-2',
                          i === 1 ? 'bg-white' : 'bg-slate-300',
                        )}
                      />
                      <div
                        className={cn(
                          'h-1 w-8 rounded-full',
                          i === 1 ? 'bg-white/50' : 'bg-slate-200 dark:bg-slate-600',
                        )}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Scanning beam (shared) */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 dark:via-white/10 to-transparent -skew-x-12 pointer-events-none"
              initial={{ left: '-150%' }}
              animate={{ left: '200%' }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                repeatDelay: 1,
                ease: 'linear',
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Actions: Timeline of speech, spotlight, and interactions being orchestrated
function ActionsVisualizer() {
  const [activeIdx, setActiveIdx] = useState(0);

  const actionItems = [
    {
      icon: MessageSquare,
      label: 'Speech',
      color: 'text-violet-500',
      activeBg: 'bg-violet-500/10',
      activeBorder: 'border-violet-200 dark:border-violet-800',
    },
    {
      icon: Focus,
      label: 'Spotlight',
      color: 'text-amber-500',
      activeBg: 'bg-amber-500/10',
      activeBorder: 'border-amber-200 dark:border-amber-800',
    },
    {
      icon: MessageSquare,
      label: 'Speech',
      color: 'text-violet-500',
      activeBg: 'bg-violet-500/10',
      activeBorder: 'border-violet-200 dark:border-violet-800',
    },
    {
      icon: Play,
      label: 'Interact',
      color: 'text-emerald-500',
      activeBg: 'bg-emerald-500/10',
      activeBorder: 'border-emerald-200 dark:border-emerald-800',
    },
    {
      icon: MessageSquare,
      label: 'Speech',
      color: 'text-violet-500',
      activeBg: 'bg-violet-500/10',
      activeBorder: 'border-violet-200 dark:border-violet-800',
    },
  ];

  // Row height (py-1.5 = 6px×2 padding + icon ~16px) + gap 6px ≈ 34px per row
  const ROW_H = 34;

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % actionItems.length);
    }, 1600);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="size-56 relative flex items-center justify-center">
      {/* Background pulse */}
      <motion.div
        className="absolute inset-0 blur-3xl rounded-full bg-violet-500/8"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 3.5, repeat: Infinity }}
      />

      {/* Timeline card */}
      <div className="w-44 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden relative">
        {/* Header */}
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <Clapperboard className="size-3 text-violet-500" />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '50%' }}
            transition={{ delay: 0.2 }}
            className="h-1.5 bg-violet-500/20 rounded-full"
          />
        </div>

        {/* Action items */}
        <div className="p-2 space-y-1.5 relative">
          {/* Sliding highlight — absolute, animates via y transform, no layout impact */}
          <motion.div
            className="absolute left-2 right-2 rounded-lg bg-violet-500/[0.06] dark:bg-violet-400/[0.08]"
            style={{ height: ROW_H - 6 }}
            animate={{ y: activeIdx * ROW_H }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          />

          {actionItems.map((item, i) => {
            const Icon = item.icon;
            const isActive = i === activeIdx;
            const isPast = i < activeIdx;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: isPast ? 0.4 : 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg"
              >
                <div
                  className={cn(
                    'size-4 rounded flex items-center justify-center shrink-0 transition-colors duration-300',
                    isActive ? item.color : 'text-slate-300 dark:text-slate-600',
                  )}
                >
                  <Icon className="size-3" />
                </div>
                <div className="flex-1 flex items-center gap-1.5">
                  <span
                    className={cn(
                      'text-[8px] font-semibold uppercase tracking-wider transition-colors duration-300',
                      isActive ? item.color : 'text-slate-400 dark:text-slate-500',
                    )}
                  >
                    {item.label}
                  </span>
                  <div
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-300',
                      isActive ? 'bg-current opacity-20' : 'bg-slate-100 dark:bg-slate-700',
                    )}
                  />
                </div>
                {/* Pulsing dot — always rendered, opacity-controlled, no layout shift */}
                <motion.div
                  className="size-1.5 rounded-full bg-violet-500"
                  animate={{ opacity: isActive ? [1, 0.3, 1] : 0 }}
                  transition={isActive ? { duration: 0.8, repeat: Infinity } : { duration: 0.2 }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
