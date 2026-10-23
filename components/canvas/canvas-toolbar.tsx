'use client';

import { ChevronLeft, ChevronRight, LayoutList, Maximize2, Minimize2, Play, RotateCcw, StepForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { PlaybackDisplay } from '@/components/stage/classroom-view-types';

export interface CanvasToolbarProps {
  currentSceneIndex: number; scenesCount: number; engineState: PlaybackDisplay;
  sidebarCollapsed?: boolean; onToggleSidebar: () => void;
  onPrevSlide?: () => void; onNextSlide?: () => void; onPlayPause?: () => void;
  onNextSegment?: () => void; onReplay?: () => void;
  isPresenting?: boolean; onTogglePresentation?: () => void;
}
const expandingControlButtonBase = 'w-auto min-w-9 max-w-9 justify-center gap-0 overflow-hidden rounded-full border-transparent bg-transparent px-0 transition-[max-width,padding,gap,border-color,background-color] duration-200 motion-reduce:transition-none';
const expandingControlLabelBase = 'max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 motion-reduce:transition-none';

export function CanvasToolbar(props: CanvasToolbarProps) {
  const { t } = useI18n();
  const playLabel = props.engineState === 'playing' ? 'classroom.pause' : props.engineState === 'paused' || props.engineState === 'discussion' ? 'classroom.resume' : 'classroom.play';
  const isPlaying = props.engineState === 'playing';
  const sceneCount = Math.max(0, props.scenesCount);
  const currentScene = sceneCount > 0 ? Math.min(sceneCount, Math.max(1, props.currentSceneIndex + 1)) : 0;
  const sceneProgress = sceneCount > 0 ? (currentScene / sceneCount) * 100 : 0;
  const actionTitle = (label: string, action?: () => void) => t(label) + (action ? '' : '：' + t('classroom.actionUnavailable'));
  return <div className="flex shrink-0 items-center justify-center bg-muted/40 px-3 py-3 sm:px-5" aria-label={t('classroom.controls')}>
    <div className="relative grid w-full max-w-[49rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 overflow-hidden rounded-[1.5rem] border border-border/80 bg-background px-2.5 pb-3 pt-2.5 shadow-md shadow-foreground/5 @3xl/classroom:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @3xl/classroom:gap-x-3 @3xl/classroom:rounded-full @3xl/classroom:px-4 @3xl/classroom:py-2.5">
      <div className="flex min-w-0 items-center gap-2 @3xl/classroom:col-start-1 @3xl/classroom:row-start-1">
        <Button variant="ghost" size="icon-lg" className="rounded-full bg-muted/70 hover:bg-muted" aria-label={t('classroom.toggleOutline')} title={t('classroom.toggleOutline')} aria-expanded={!props.sidebarCollapsed} onClick={props.onToggleSidebar}><LayoutList /></Button>
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:text-sm">{t('classroom.scenePosition', { current: currentScene, total: sceneCount })}</span>
      </div>
      <div className="flex items-center justify-self-end @3xl/classroom:col-start-3 @3xl/classroom:row-start-1">
        <Button type="button" variant="ghost" size="icon-lg" className="rounded-full" aria-label={t('classroom.replay')} title={actionTitle('classroom.replay', props.onReplay)} disabled={!props.onReplay} onClick={props.onReplay}><RotateCcw /></Button>
        <Button type="button" variant="ghost" size="icon-lg" className="rounded-full" aria-label={t('classroom.nextSegment')} title={actionTitle('classroom.nextSegment', props.onNextSegment)} disabled={!props.onNextSegment} onClick={props.onNextSegment}><StepForward /></Button>
        <Separator orientation="vertical" className="mx-1 h-5" style={{ alignSelf: 'center' }} />
        <Button type="button" variant="ghost" size="icon-lg" className="rounded-full" aria-label={t(props.isPresenting ? 'classroom.exitFullscreen' : 'classroom.fullscreen')}
          title={actionTitle(props.isPresenting ? 'classroom.exitFullscreen' : 'classroom.fullscreen', props.onTogglePresentation)}
          disabled={!props.onTogglePresentation} onClick={props.onTogglePresentation}>{props.isPresenting ? <Minimize2 /> : <Maximize2 />}</Button>
      </div>
      <div className="order-3 col-span-2 grid w-full max-w-[22rem] min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-self-center gap-1 @3xl/classroom:order-none @3xl/classroom:col-start-2 @3xl/classroom:col-span-1 @3xl/classroom:row-start-1 @3xl/classroom:gap-1.5">
        <div className="group/previous-control flex min-w-0 justify-end">
          <Button type="button" variant="ghost" size="icon-lg" className={`${expandingControlButtonBase} group-hover/previous-control:max-w-48 group-hover/previous-control:gap-1.5 group-hover/previous-control:border-border group-hover/previous-control:bg-background group-hover/previous-control:px-3 group-focus-within/previous-control:max-w-48 group-focus-within/previous-control:gap-1.5 group-focus-within/previous-control:border-border group-focus-within/previous-control:bg-background group-focus-within/previous-control:px-3`} aria-label={t('classroom.previousScene')} title={actionTitle('classroom.previousScene', props.onPrevSlide)} disabled={!props.onPrevSlide} onClick={props.onPrevSlide}>
            <span className={`${expandingControlLabelBase} group-hover/previous-control:max-w-40 group-hover/previous-control:opacity-100 group-focus-within/previous-control:max-w-40 group-focus-within/previous-control:opacity-100`}>{t('classroom.previousScene')}</span>
            <ChevronLeft className="size-4 shrink-0" />
          </Button>
        </div>
        <Button type="button" variant="default" size="icon-lg" className="size-14 rounded-full border-0 text-primary-foreground shadow-md shadow-primary/35 focus-visible:border-0 focus-visible:ring-0" aria-label={t(playLabel)} title={actionTitle(playLabel, props.onPlayPause)} disabled={!props.onPlayPause} onClick={props.onPlayPause}>
          {isPlaying ? <span aria-hidden="true" className="flex items-center gap-1.5"><span className="h-6 w-1.5 rounded-full bg-current" /><span className="h-6 w-1.5 rounded-full bg-current" /></span> : <Play className="size-6 fill-current" strokeWidth={2.5} />}
        </Button>
        <div className="group/next-control flex min-w-0 justify-start">
          <Button type="button" variant="ghost" size="icon-lg" className={`${expandingControlButtonBase} group-hover/next-control:max-w-48 group-hover/next-control:gap-1.5 group-hover/next-control:border-border group-hover/next-control:bg-background group-hover/next-control:px-3 group-focus-within/next-control:max-w-48 group-focus-within/next-control:gap-1.5 group-focus-within/next-control:border-border group-focus-within/next-control:bg-background group-focus-within/next-control:px-3`} aria-label={t('classroom.nextScene')} title={actionTitle('classroom.nextScene', props.onNextSlide)} disabled={!props.onNextSlide} onClick={props.onNextSlide}>
            <ChevronRight className="size-4 shrink-0" />
            <span className={`${expandingControlLabelBase} group-hover/next-control:max-w-40 group-hover/next-control:opacity-100 group-focus-within/next-control:max-w-40 group-focus-within/next-control:opacity-100`}>{t('classroom.nextScene')}</span>
          </Button>
        </div>
      </div>
      <div role="progressbar" aria-label={t('classroom.sceneProgress')} aria-valuemin={0} aria-valuemax={Math.max(1, sceneCount)} aria-valuenow={currentScene} className="pointer-events-none absolute inset-x-6 bottom-0 h-0.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${sceneProgress}%` }} />
      </div>
    </div>
  </div>;
}
