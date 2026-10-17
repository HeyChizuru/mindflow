'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GripVertical, Loader2, Minimize2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { SceneOutline } from '@/lib/types/outline';

type SceneType = SceneOutline['type'];

/** 手改允许动的字段。不包含 `type`，已有场景的类型保持不变。 */
type OutlineFieldPatch = {
  title?: string;
  description?: string;
  keyPoints?: string[];
};

/** 用户新增 quiz 时的默认测验配置（B-6）；创建后不可再改（B-7）。 */
const DEFAULT_NEW_QUIZ_CONFIG = {
  questionCount: 2,
  difficulty: 'medium' as const,
  questionTypes: ['single' as const],
};

function createSlideOutline(order: number): SceneOutline {
  return {
    id: nanoid(8),
    type: 'slide',
    title: '',
    description: '',
    keyPoints: [],
    order,
  };
}

function createQuizOutline(order: number): SceneOutline {
  return {
    id: nanoid(8),
    type: 'quiz',
    title: '',
    description: '',
    keyPoints: [],
    order,
    quizConfig: { ...DEFAULT_NEW_QUIZ_CONFIG },
  };
}

interface OutlinesEditorProps {
  outlines: SceneOutline[];
  onChange: (outlines: SceneOutline[]) => void;
  onBack: () => void;
  isLoading?: boolean;
  /** SSE is still pumping outlines into this editor — render read-only. */
  isStreaming?: boolean;
  isReadOnly?: boolean;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  /** Collapse the editor back to the preview surface (small streaming card / outline-ready). */
  onCollapse?: () => void;
}

const TYPE_THEME: Record<
  SceneType,
  {
    chip: string;
    dot: string;
  }
> = {
  slide: {
    chip: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    dot: 'bg-blue-400',
  },
  quiz: {
    chip: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300',
    dot: 'bg-purple-400',
  },
};

function normalizeOrder(outlines: SceneOutline[]): SceneOutline[] {
  return outlines.map((outline, index) => ({
    ...outline,
    order: index + 1,
  }));
}

function useSceneTypeLabel() {
  const { t } = useI18n();
  return (type: SceneType) => {
    switch (type) {
      case 'quiz':
        return t('generation.sceneTypeQuiz');
      case 'slide':
      default:
        return t('generation.sceneTypeSlide');
    }
  };
}

export function OutlinesEditor({
  outlines,
  onChange,
  onBack,
  isLoading = false,
  isStreaming = false,
  isReadOnly = false,
  onConfirm,
  confirmDisabled = false,
  onCollapse,
}: OutlinesEditorProps) {
  const { t } = useI18n();
  const sceneTypeLabel = useSceneTypeLabel();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const lastScrollTargetRef = useRef<string | null>(null);
  const editingDisabled = isLoading || isStreaming || isReadOnly;
  const lastOutlineId = outlines.length > 0 ? outlines[outlines.length - 1].id : null;

  // Auto-scroll to the latest streamed scene so streaming feels alive.
  useEffect(() => {
    if (!isStreaming || !lastOutlineId) return;
    if (lastScrollTargetRef.current === lastOutlineId) return;
    lastScrollTargetRef.current = lastOutlineId;
    const node = document.getElementById(`outline-scene-${lastOutlineId}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isStreaming, lastOutlineId]);

  const addOutline = (type: SceneType = 'slide') => {
    if (editingDisabled) return;
    const order = outlines.length + 1;
    const newOutline = type === 'quiz' ? createQuizOutline(order) : createSlideOutline(order);
    onChange(normalizeOrder([...outlines, newOutline]));
  };

  const updateOutline = (index: number, updates: OutlineFieldPatch) => {
    if (editingDisabled) return;
    const current = outlines[index];
    if (!current) return;
    const next = outlines.slice();
    next[index] = { ...current, ...updates, type: current.type } as SceneOutline;
    onChange(normalizeOrder(next));
  };

  const removeOutline = (index: number) => {
    if (editingDisabled) return;
    onChange(normalizeOrder(outlines.filter((_, i) => i !== index)));
  };

  const insertOutlineAt = (atIndex: number, type: SceneType = 'slide') => {
    if (editingDisabled) return;
    const newOutline =
      type === 'quiz' ? createQuizOutline(atIndex + 1) : createSlideOutline(atIndex + 1);
    const next = [...outlines];
    next.splice(atIndex, 0, newOutline);
    onChange(normalizeOrder(next));
  };

  const moveOutline = (index: number, direction: 'up' | 'down') => {
    if (editingDisabled) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= outlines.length) return;
    const next = [...outlines];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(normalizeOrder(next));
  };

  const reorderOutline = (fromIndex: number, toIndex: number) => {
    if (editingDisabled) return;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...outlines];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    onChange(normalizeOrder(next));
  };

  const headerSubtitle = useMemo(() => {
    if (isReadOnly) return t('generation.outlineConfirmedSummary', { count: outlines.length });
    if (isStreaming) {
      return outlines.length > 0
        ? t('generation.outlineEditorStreamingProgress', { count: outlines.length })
        : t('generation.outlineEditorStreamingWaiting');
    }
    return t('generation.outlineEditorSummary', { count: outlines.length });
  }, [isReadOnly, isStreaming, outlines.length, t]);

  return (
    <motion.div
      layoutId="outline-review-surface"
      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      // Explicit rotate: 0 so the layout-shared morph from the tilted preview
      // card interpolates rotation cleanly back to upright.
      initial={{ rotate: 0 }}
      animate={{ rotate: 0 }}
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border/40',
        'bg-white/85 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl',
        'dark:border-white/5 dark:bg-slate-950/70 dark:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]',
      )}
    >
      {/* Soft gradient wash */}
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[80%] -translate-x-1/2 rounded-full bg-blue-500/[0.04] blur-3xl dark:bg-blue-400/[0.08]" />

      {/* Header */}
      <div className="relative flex items-start gap-3 px-6 pt-6 pb-4 md:px-10 md:pt-8 md:pb-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
            <Sparkles className="size-3 text-blue-500" />
            {t('generation.outlineEditorEyebrow')}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-[28px]">
            {t('generation.outlineEditorTitle')}
          </h2>
          <p className="flex min-h-[1.5rem] items-center gap-2 text-sm text-muted-foreground">
            {isStreaming && (
              <motion.span
                aria-hidden
                className="inline-flex size-1.5 rounded-full bg-blue-500"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
            {headerSubtitle}
          </p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            disabled={isLoading}
            aria-label={t('generation.collapseEditor')}
            className={cn(
              'mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
              'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Minimize2 className="size-3.5" />
            <span className="hidden sm:inline">{t('generation.collapseEditor')}</span>
          </button>
        )}
      </div>

      {/* Scene list */}
      <div className="relative max-h-[64vh] overflow-y-auto px-3 pb-2 md:px-6">
        {outlines.length === 0 ? (
          <EmptyState
            isStreaming={isStreaming}
            disabled={editingDisabled}
            onAddSlide={() => addOutline('slide')}
            onAddQuiz={() => addOutline('quiz')}
          />
        ) : (
          <ol className="flex flex-col py-1">
            {!editingDisabled && (
              <InsertSceneDivider
                onInsert={(type) => insertOutlineAt(0, type)}
                disabled={editingDisabled}
                position="edge"
              />
            )}
            <AnimatePresence initial={false}>
              {outlines.map((outline, index) => {
                const isLast = outline.id === lastOutlineId;
                const isStreamingTip = isStreaming && isLast;

                return (
                  <Fragment key={outline.id}>
                    <SceneRow
                      index={index}
                      outline={outline}
                      onUpdate={(updates) => updateOutline(index, updates)}
                      onRemove={() => removeOutline(index)}
                      onMoveUp={() => moveOutline(index, 'up')}
                      onMoveDown={() => moveOutline(index, 'down')}
                      canMoveUp={index > 0}
                      canMoveDown={index < outlines.length - 1}
                      sceneTypeLabel={sceneTypeLabel}
                      disabled={editingDisabled}
                      isStreamingTip={isStreamingTip}
                      isDragging={draggingId === outline.id}
                      isDragTarget={dragOverId === outline.id && draggingId !== outline.id}
                      onDragStart={() => setDraggingId(outline.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                      onDragEnter={() => {
                        if (draggingId && draggingId !== outline.id) {
                          setDragOverId(outline.id);
                        }
                      }}
                      onDrop={(sourceId) => {
                        const fromIndex = outlines.findIndex((item) => item.id === sourceId);
                        if (fromIndex >= 0) reorderOutline(fromIndex, index);
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                    />
                    {!editingDisabled && (
                      <InsertSceneDivider
                        onInsert={(type) => insertOutlineAt(index + 1, type)}
                        disabled={editingDisabled}
                        position={isLast ? 'edge' : 'between'}
                      />
                    )}
                  </Fragment>
                );
              })}
            </AnimatePresence>
            {isStreaming && <StreamingPlaceholder nextIndex={outlines.length + 1} />}
          </ol>
        )}
      </div>

      {/* Footer */}
      <div className="relative flex flex-col gap-3 border-t border-border/40 bg-gradient-to-t from-background/95 to-transparent px-6 py-4 md:flex-row md:items-center md:justify-end md:px-10 md:py-5">
        {isReadOnly && (
          <p role="status" className="text-sm text-muted-foreground md:mr-auto">
            {t('generation.outlineConfirmed')}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:gap-2">
          <Button
            variant="ghost"
            onClick={onBack}
            disabled={isLoading}
            className="rounded-full px-4 text-muted-foreground hover:text-foreground"
          >
            {t('generation.backToRequirements')}
          </Button>
          {onConfirm && !isReadOnly && (
            <Button
              type="button"
              onClick={onConfirm}
              disabled={editingDisabled || confirmDisabled || outlines.length === 0}
              className="rounded-full px-6"
            >
              {isLoading && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {t(isLoading ? 'generation.confirmingOutline' : 'generation.confirmOutline')}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Scene row — Notion-style inline-editable card
// ────────────────────────────────────────────────────────────────────────────────

interface SceneRowProps {
  index: number;
  outline: SceneOutline;
  onUpdate: (updates: OutlineFieldPatch) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  sceneTypeLabel: (type: SceneType) => string;
  disabled: boolean;
  isStreamingTip: boolean;
  isDragging: boolean;
  isDragTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: (sourceId: string) => void;
}

function SceneRow({
  index,
  outline,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  sceneTypeLabel,
  disabled,
  isStreamingTip,
  isDragging,
  isDragTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
}: SceneRowProps) {
  const { t } = useI18n();
  const theme = TYPE_THEME[outline.type] ?? TYPE_THEME.slide;
  const [keyPointDraft, setKeyPointDraft] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textareas to content for the typography-first feel.
  useAutoResize(titleRef, outline.title);
  useAutoResize(descRef, outline.description);

  const addKeyPoint = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const next = [...(outline.keyPoints ?? []), trimmed];
    onUpdate({ keyPoints: next });
    setKeyPointDraft('');
  };

  const removeKeyPoint = (idx: number) => {
    const next = (outline.keyPoints ?? []).filter((_, i) => i !== idx);
    onUpdate({ keyPoints: next });
  };

  const handleKeyPointKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addKeyPoint(keyPointDraft);
    } else if (
      event.key === 'Backspace' &&
      !keyPointDraft &&
      (outline.keyPoints?.length ?? 0) > 0
    ) {
      removeKeyPoint((outline.keyPoints?.length ?? 0) - 1);
    }
  };

  return (
    <motion.li
      id={`outline-scene-${outline.id}`}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={onDragEnter}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData('text/plain');
        if (sourceId) onDrop(sourceId);
      }}
      className={cn(
        'group/scene relative rounded-2xl px-3 py-3.5 transition-colors md:px-4',
        'hover:bg-slate-50/60 dark:hover:bg-slate-800/30',
        'focus-within:bg-slate-50/80 dark:focus-within:bg-slate-800/40',
        isDragging && 'opacity-40',
        isDragTarget && 'bg-blue-500/[0.04] ring-1 ring-blue-400/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Left rail: drag handle + number, baseline-aligned with title */}
        <div className="flex shrink-0 items-center gap-0.5 pt-1">
          {!disabled && <button
            type="button"
            draggable={!disabled}
            title={t('generation.dragSceneHint')}
            aria-label={t('generation.dragSceneHint')}
            aria-keyshortcuts="Control+ArrowUp Control+ArrowDown Meta+ArrowUp Meta+ArrowDown"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', outline.id);
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            onKeyDown={(event) => {
              if (disabled) return;
              // Keyboard reorder: Cmd/Ctrl + ArrowUp / ArrowDown. Plain arrows
              // are reserved for browser text-cursor navigation when focus
              // shifts between fields.
              if (!(event.ctrlKey || event.metaKey)) return;
              if (event.key === 'ArrowUp' && canMoveUp) {
                event.preventDefault();
                onMoveUp();
              } else if (event.key === 'ArrowDown' && canMoveDown) {
                event.preventDefault();
                onMoveDown();
              }
            }}
            disabled={disabled}
            className={cn(
              'flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md',
              'text-muted-foreground/45 transition-all',
              'hover:bg-muted hover:text-foreground/80',
              'group-hover/scene:text-muted-foreground/70',
              'active:cursor-grabbing',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
              disabled && 'pointer-events-none opacity-30',
            )}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>}
          <span
            className={cn(
              'relative flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors',
              'bg-muted/60 text-muted-foreground',
              'group-hover/scene:bg-muted',
            )}
          >
            {index + 1}
            {isStreamingTip && (
              <motion.span
                aria-hidden
                className={cn('absolute -right-0.5 -top-0.5 size-2 rounded-full', theme.dot)}
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
          </span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <textarea
              ref={titleRef}
              value={outline.title}
              onChange={(event) => onUpdate({ title: event.target.value })}
              placeholder={t('generation.sceneTitlePlaceholder')}
              disabled={disabled}
              rows={1}
              spellCheck={false}
              className={cn(
                'flex-1 resize-none border-none bg-transparent p-0 text-base font-semibold leading-7 tracking-tight',
                'placeholder:font-normal placeholder:text-muted-foreground/40',
                'focus:outline-none focus:ring-0 md:text-lg',
                disabled && 'cursor-default',
              )}
            />
            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              <TypePill label={sceneTypeLabel(outline.type)} theme={theme} />
              {!disabled && <DeleteSceneButton onConfirm={onRemove} />}
            </div>
          </div>

          {/* Description */}
          <textarea
            ref={descRef}
            value={outline.description}
            onChange={(event) => onUpdate({ description: event.target.value })}
            placeholder={t('generation.sceneDescriptionPlaceholder')}
            disabled={disabled}
            rows={1}
            className={cn(
              'block w-full resize-none border-none bg-transparent p-0 text-sm leading-relaxed text-muted-foreground',
              'placeholder:text-muted-foreground/40',
              'focus:outline-none focus:ring-0 focus:text-foreground/90',
              disabled && 'cursor-default',
            )}
          />

          {/* Key points */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <AnimatePresence initial={false}>
              {(outline.keyPoints ?? []).filter(Boolean).map((point, idx) => (
                <motion.span
                  key={`${outline.id}-kp-${idx}-${point}`}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'group/chip inline-flex max-w-[18rem] items-center gap-1 rounded-full px-2.5 py-1 text-xs',
                    'bg-muted/70 text-foreground/80',
                  )}
                >
                  <span className="truncate">{point}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeKeyPoint(idx)}
                      aria-label={t('generation.removeKeyPoint')}
                      className="ml-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/0 transition-colors hover:bg-muted-foreground/20 hover:text-muted-foreground group-hover/chip:text-muted-foreground/70"
                    >
                      <X className="size-2.5" />
                    </button>
                  )}
                </motion.span>
              ))}
            </AnimatePresence>
            {!disabled && (
              <KeyPointInput
                value={keyPointDraft}
                onChange={setKeyPointDraft}
                onKeyDown={handleKeyPointKeyDown}
                placeholder={t('generation.addKeyPoint')}
              />
            )}
          </div>

          {outline.type === 'quiz' && outline.quizConfig && (
            <QuizConfigSummary outline={outline} />
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────────────

function EmptyState({
  isStreaming,
  disabled,
  onAddSlide,
  onAddQuiz,
}: {
  isStreaming: boolean;
  disabled: boolean;
  onAddSlide: () => void;
  onAddQuiz: () => void;
}) {
  const { t } = useI18n();

  if (isStreaming) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="text-blue-500/70"
        >
          <Loader2 className="size-6" />
        </motion.div>
        <p className="text-sm text-muted-foreground">
          {t('generation.outlineEditorStreamingWaiting')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{t('generation.noOutlines')}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          onClick={onAddSlide}
          disabled={disabled}
          className="rounded-full"
        >
          <Plus className="size-4" />
          {t('generation.sceneTypeSlide')}
        </Button>
        <Button
          variant="outline"
          onClick={onAddQuiz}
          disabled={disabled}
          className="rounded-full"
        >
          <Plus className="size-4" />
          {t('generation.sceneTypeQuiz')}
        </Button>
      </div>
    </div>
  );
}

/** 只展示场景类型。已有场景不能在这里改成另一种类型。 */
function TypePill({
  label,
  theme,
}: {
  label: string;
  theme: (typeof TYPE_THEME)[SceneType];
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        theme.chip,
      )}
    >
      {label}
    </span>
  );
}

function DeleteSceneButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('generation.deleteScene')}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-full text-muted-foreground/40 transition-all',
            'hover:bg-destructive/10 hover:text-destructive',
            'opacity-0 group-hover/scene:opacity-100',
            'data-[state=open]:opacity-100 data-[state=open]:bg-destructive/10 data-[state=open]:text-destructive',
            'focus-visible:opacity-100 focus-visible:outline-none',
          )}
        >
          <Trash2 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-56 p-3">
        <p className="text-sm font-medium">{t('generation.deleteSceneConfirm')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('generation.deleteSceneConfirmDesc')}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-8"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
            className="h-8"
          >
            {t('generation.deleteSceneConfirmAction')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StreamingPlaceholder({ nextIndex }: { nextIndex: number }) {
  const { t } = useI18n();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      aria-live="polite"
      aria-label={t('generation.outlineEditorStreamingWaiting')}
      className="relative flex items-start gap-2.5 px-3 py-3.5 md:px-4"
    >
      {/* Left rail: spacer for grip column + spinner where the number badge would be */}
      <div className="flex shrink-0 items-center gap-0.5 pt-1">
        <span className="size-7" aria-hidden />
        <span className="flex size-7 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      </div>

      {/* Body: pulsing skeleton lines that mirror title + description heights */}
      <div className="min-w-0 flex-1 space-y-2 pt-1.5">
        <motion.div
          aria-hidden
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="h-4 w-3/5 rounded-md bg-muted/50"
        />
        <motion.div
          aria-hidden
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }}
          className="h-3 w-2/5 rounded bg-muted/40"
        />
      </div>

      {/* Hidden but exposed to screen readers */}
      <span className="sr-only">
        {t('generation.outlineEditorStreamingProgress', { count: nextIndex - 1 })}
      </span>
    </motion.li>
  );
}

function InsertSceneDivider({
  onInsert,
  disabled,
  position = 'between',
}: {
  onInsert: (type: SceneType) => void;
  disabled: boolean;
  /** Edge dividers (before first / after last) keep a faint hint to invite adding. */
  position?: 'between' | 'edge';
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const isEdge = position === 'edge';

  const pick = (type: SceneType) => {
    onInsert(type);
    setOpen(false);
  };

  return (
    <li
      role="presentation"
      className="relative z-10 flex h-7 items-center justify-center px-3 md:px-4"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('generation.insertSceneHere')}
            className={cn(
              'group/insert relative flex h-full w-full items-center justify-center transition-opacity',
              isEdge && 'opacity-25 hover:opacity-100 focus-visible:opacity-100',
              'focus-visible:outline-none',
              disabled && 'pointer-events-none opacity-20',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute top-1/2 h-px -translate-y-1/2 transition-colors',
                isEdge
                  ? 'inset-x-16 bg-muted-foreground/40 group-hover/insert:bg-blue-500/60'
                  : 'inset-x-8 bg-muted-foreground/35 group-hover/insert:bg-blue-500/60',
              )}
            />
            <span
              className={cn(
                'relative flex items-center justify-center rounded-full text-white transition-all',
                isEdge
                  ? 'size-4 bg-muted-foreground/60 group-hover/insert:size-5 group-hover/insert:bg-blue-500 group-hover/insert:shadow-md group-hover/insert:shadow-blue-500/30'
                  : 'size-5 bg-blue-500 opacity-0 shadow-md shadow-blue-500/30 group-hover/insert:scale-110 group-hover/insert:opacity-100 focus-visible:opacity-100',
              )}
            >
              <Plus className={cn('transition-all', isEdge ? 'size-2.5' : 'size-3')} />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" sideOffset={6} className="w-44 p-1">
          <button
            type="button"
            onClick={() => pick('slide')}
            className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
          >
            {t('generation.sceneTypeSlide')}
          </button>
          <button
            type="button"
            onClick={() => pick('quiz')}
            className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
          >
            {t('generation.sceneTypeQuiz')}
          </button>
        </PopoverContent>
      </Popover>
    </li>
  );
}

/** 已有场景的测验配置只展示，不可编辑（B-7）。 */
function QuizConfigSummary({ outline }: { outline: SceneOutline }) {
  const { t } = useI18n();
  if (outline.type !== 'quiz' || !outline.quizConfig) return null;
  const config = outline.quizConfig;

  return (
    <span
      className={cn(
        'mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
        'text-purple-600 dark:text-purple-300',
        'bg-purple-500/[0.06]',
      )}
    >
      {t('generation.quizConfigSummary', { count: config.questionCount })}
    </span>
  );
}

function KeyPointInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const width = Math.max(100, Math.min(280, value.length * 8 + 40));

  // Note: intentionally no onBlur commit. Committing on blur surprises users
  // who type a partial value then click away — that text becomes a chip they
  // didn't ask for. Only Enter / comma should commit (handled by onKeyDown).
  return (
    <div className="inline-flex items-center gap-1">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ width }}
        className={cn(
          'inline-block rounded-full bg-transparent px-2.5 py-1 text-xs',
          'text-foreground placeholder:text-muted-foreground/50',
          'border border-dashed border-transparent transition-colors',
          'hover:border-muted-foreground/20 focus:border-blue-400/50 focus:bg-blue-500/[0.03]',
          'focus:outline-none focus:ring-0',
        )}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Defer measurement+write to a frame so a burst of edits doesn't thrash
    // layout (read scrollHeight ≡ forced reflow). Cancel any prior frame so
    // we only run once per render.
    const frame = requestAnimationFrame(() => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [ref, value]);
}

