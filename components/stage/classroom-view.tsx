'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import { Header } from '@/components/header';
import { GlobalControls } from '@/components/global-controls';
import { SceneSidebar } from './scene-sidebar';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { PlaybackCaption } from './playback-caption';
import { ClassroomStatus, ClassroomNoticeView, BackgroundGenerationFailure, BackgroundGenerationAnnouncement } from './classroom-status';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClassroomChatPanel } from './classroom-chat';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ClassroomViewProps } from './classroom-view-types';

export function ClassroomView(props: ClassroomViewProps) {
  const { t } = useI18n();
  const chatTrigger = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.chat?.state.open) return;
    const node = shell.current;
    const viewport = window.visualViewport;
    const resize = () => node?.style.setProperty('--classroom-viewport-height', (viewport?.height ?? window.innerHeight) + 'px');
    resize();
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
      node?.style.removeProperty('--classroom-viewport-height');
    };
  }, [props.chat?.state.open]);
  const { scene, directory, pageState = 'ready' } = props;
  const notices = props.notices ?? (props.notice ? [props.notice] : []);
  const index = directory.findIndex((item) => item.sceneId !== null && item.sceneId === scene?.id);
  const courseEnd = props.allScenesReady && props.playback === 'ended' && index === directory.length - 1 && index >= 0;
  return <div ref={shell} className="mindflow-surface classroom-shell relative flex h-full min-h-0 flex-1 overflow-hidden text-foreground max-lg:max-h-[var(--classroom-viewport-height)]">
    <GlobalControls />
    {pageState === 'ready' && <SceneSidebar directory={directory} currentSceneId={scene?.id ?? null}
      collapsed={props.sidebarCollapsed} onCollapseChange={props.onToggleSidebar} onSceneSelect={props.onSceneSelect}
      generation={props.generation} onRetryGeneration={props.onRetryGeneration} />}
    <main className="flex min-h-0 min-w-0 flex-1 flex-col [@media(max-height:500px)]:overflow-y-auto">
      <div className={cn('flex min-w-0 shrink-0 items-center', props.chat?.state.open ? 'pr-3' : 'pr-28')}><Header currentSceneTitle={scene?.title ?? ''} /></div>
      <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label={t('classroom.learningArea')} tabIndex={props.chat?.state.open ? 0 : undefined}
        className={cn('flex min-h-0 min-w-0 flex-1 flex-col', props.chat?.state.open && 'max-lg:overflow-y-auto max-lg:overscroll-contain')}>
      {pageState !== 'ready' ? <ClassroomStatus state={pageState} generationUrl={props.generationUrl} onRead={props.onRead} /> : <>
        {props.generation && <BackgroundGenerationAnnouncement state={props.generation}
          ready={directory.filter(entry => entry.ready).length} total={directory.length} />}
        {(props.generation?.phase === 'failed' || notices.length > 0 || props.playback === 'ended') &&
          <section aria-label={t('background.notices')} tabIndex={0} data-testid="classroom-notices"
            className="flex max-h-[30dvh] shrink-0 flex-col gap-2 overflow-y-auto px-3 pb-2 [overflow-wrap:anywhere]">
        {props.generation && <BackgroundGenerationFailure state={props.generation} onRetry={props.onRetryGeneration} />}
        {notices.map((notice, index) => <ClassroomNoticeView key={index} notice={notice} />)}
        {props.playback === 'ended' && <div>
          <ClassroomNoticeView notice={{ title: t(courseEnd ? 'classroom.lastPage' : 'classroom.sceneEnd'),
            message: t(courseEnd ? 'classroom.lastPageHint' : 'classroom.sceneEndHint') }} />
          {courseEnd && <div className="flex flex-wrap items-center gap-2 py-2">
            <Button variant="outline" onClick={props.onReplay} disabled={!props.onReplay}>{t('classroom.replay')}</Button>
            <Button asChild variant="outline"><Link href="/">{t('generation.backToHome')}</Link></Button>
            {props.ungraded?.map((item) => <Button variant="outline" key={item.sceneId + item.questionId} disabled={!props.onLocateQuestion}
              onClick={() => props.onLocateQuestion?.(item.sceneId, item.questionId)}>{t('classroom.ungraded')}：{item.label}</Button>)}
          </div>}
        </div>}
        </section>}
        <div className={cn('flex min-h-0 flex-1 flex-col [@media(max-height:500px)]:min-h-72', props.chat?.state.open && 'max-lg:min-h-64')}>
        <CanvasArea currentScene={scene} currentSceneIndex={index} scenesCount={directory.length}
          engineState={props.playback} sidebarCollapsed={props.sidebarCollapsed} onToggleSidebar={props.onToggleSidebar}
          onPrevSlide={props.onPrevious} onNextSlide={props.onNext} onPlayPause={props.onPlayPause}
          onNextSegment={props.onNextSegment} onReplay={props.onReplay}
          isPresenting={props.isPresenting} onTogglePresentation={props.onFullscreen} quiz={props.quiz} effects={props.effects} />
        </div>
        <PlaybackCaption playback={props.playback} subtitle={props.subtitle} chatControl={props.chat && <Tooltip><TooltipTrigger asChild>
          <Button ref={chatTrigger} type="button" variant="ghost" size="icon" aria-label={t(props.chat.state.open ? 'chat.close' : 'chat.open')}
            aria-controls="classroom-chat" aria-expanded={props.chat.state.open} onClick={() => {
              if (props.chat!.state.open) props.chat!.onClose(); else props.chat!.onOpen();
            }}><MessageCircle /></Button>
        </TooltipTrigger><TooltipContent>{t(props.chat.state.open ? 'chat.close' : 'chat.open')}</TooltipContent></Tooltip>} />
      </>}
      </section>
      </div>
    </main>
    {pageState === 'ready' && props.chat?.state.open && <ClassroomChatPanel chat={props.chat} directory={directory} currentSceneTitle={scene?.title ?? ''} onClose={() => {
      props.chat!.onClose(); chatTrigger.current?.focus({ preventScroll: true });
    }} />}
  </div>;
}
