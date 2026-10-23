'use client';

import Link from 'next/link';
import { Header } from '@/components/header';
import { SceneSidebar } from './scene-sidebar';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { PlaybackCaption } from './playback-caption';
import { ClassroomStatus, ClassroomNoticeView } from './classroom-status';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ClassroomViewProps } from './classroom-view-types';

export function ClassroomView(props: ClassroomViewProps) {
  const { t } = useI18n();
  const { scene, directory, pageState = 'ready' } = props;
  const index = directory.findIndex((item) => item.sceneId !== null && item.sceneId === scene?.id);
  const courseEnd = props.allScenesReady && props.playback === 'ended' && index === directory.length - 1 && index >= 0;
  return <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
    {pageState === 'ready' && <SceneSidebar directory={directory} currentSceneId={scene?.id ?? null}
      collapsed={props.sidebarCollapsed} onCollapseChange={props.onToggleSidebar} onSceneSelect={props.onSceneSelect} />}
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/40">
      <div className="flex min-w-0 shrink-0 items-center pr-3"><Header currentSceneTitle={scene?.title ?? ''} /></div>
      {pageState !== 'ready' ? <ClassroomStatus state={pageState} generationUrl={props.generationUrl} onRead={props.onRead} /> : <>
        {props.notice && <div className="max-h-[22dvh] shrink-0 overflow-y-auto px-3 pb-2"><ClassroomNoticeView notice={props.notice} /></div>}
        {props.playback === 'ended' && <div className="max-h-[25dvh] shrink-0 overflow-y-auto px-3 pb-2">
          <ClassroomNoticeView notice={{ title: t(courseEnd ? 'classroom.lastPage' : 'classroom.sceneEnd'),
            message: t(courseEnd ? 'classroom.lastPageHint' : 'classroom.sceneEndHint') }} />
          {courseEnd && <div className="flex flex-wrap items-center gap-2 py-2">
            <Button variant="outline" onClick={props.onReplay} disabled={!props.onReplay}>{t('classroom.replay')}</Button>
            <Button asChild variant="outline"><Link href="/">{t('generation.backToHome')}</Link></Button>
            {props.ungraded?.map((item) => <Button variant="outline" key={item.sceneId + item.questionId} disabled={!props.onLocateQuestion}
              onClick={() => props.onLocateQuestion?.(item.sceneId, item.questionId)}>{t('classroom.ungraded')}：{item.label}</Button>)}
          </div>}
        </div>}
        <CanvasArea currentScene={scene} currentSceneIndex={index} scenesCount={directory.length}
          engineState={props.playback} sidebarCollapsed={props.sidebarCollapsed} onToggleSidebar={props.onToggleSidebar}
          onPrevSlide={props.onPrevious} onNextSlide={props.onNext} onPlayPause={props.onPlayPause}
          onNextSegment={props.onNextSegment} onReplay={props.onReplay}
          isPresenting={props.isPresenting} onTogglePresentation={props.onFullscreen} quiz={props.quiz} effects={props.effects} />
        <PlaybackCaption playback={props.playback} subtitle={props.subtitle} discussion={props.discussion} onContinue={props.onContinue} />
      </>}
    </main>
  </div>;
}
