'use client';

import { ChevronLeft, ChevronRight, LayoutList, Maximize2, Minimize2, Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { PlaybackDisplay } from '@/components/stage/classroom-view-types';

export interface CanvasToolbarProps {
  currentSceneIndex: number; scenesCount: number; engineState: PlaybackDisplay;
  sidebarCollapsed?: boolean; onToggleSidebar: () => void;
  onPrevSlide?: () => void; onNextSlide?: () => void; onPlayPause?: () => void;
  onNextSegment?: () => void; onReplay?: () => void;
  isPresenting?: boolean; onTogglePresentation?: () => void;
}
export function CanvasToolbar(props: CanvasToolbarProps) {
  const { t } = useI18n();
  const actions = [
    { label: 'classroom.previousScene', Icon: ChevronLeft, action: props.onPrevSlide },
    { label: props.engineState === 'playing' ? 'classroom.pause' : props.engineState === 'paused' || props.engineState === 'discussion' ? 'classroom.resume' : 'classroom.play', Icon: props.engineState === 'playing' ? Pause : Play, action: props.onPlayPause },
    { label: 'classroom.nextSegment', Icon: StepForward, action: props.onNextSegment },
    { label: 'classroom.replay', Icon: RotateCcw, action: props.onReplay },
    { label: 'classroom.nextScene', Icon: ChevronRight, action: props.onNextSlide },
  ];
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background px-3 py-2" aria-label={t('classroom.controls')}>
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" aria-label={t('classroom.toggleOutline')} aria-expanded={!props.sidebarCollapsed} onClick={props.onToggleSidebar}><LayoutList /></Button>
      <span className="text-xs tabular-nums text-muted-foreground">{Math.max(0, props.currentSceneIndex + 1)}/{props.scenesCount}</span>
    </div>
    <div className="flex flex-wrap items-center gap-1">
      {actions.map(({ label, Icon, action }) => <Button key={label} type="button" variant="ghost" size="icon"
        aria-label={t(label)} title={action ? t(label) : t(label) + '：' + t('classroom.actionUnavailable')} disabled={!action} onClick={action}><Icon /></Button>)}
    </div>
    <Button variant="ghost" size="icon" aria-label={t(props.isPresenting ? 'classroom.exitFullscreen' : 'classroom.fullscreen')}
      disabled={!props.onTogglePresentation} onClick={props.onTogglePresentation}>{props.isPresenting ? <Minimize2 /> : <Maximize2 />}</Button>
  </div>;
}
