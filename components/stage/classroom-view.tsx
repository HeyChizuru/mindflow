'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import { Header } from '@/components/header';
import { GlobalControls } from '@/components/global-controls';
import { SceneSidebar } from './scene-sidebar';
import { CanvasArea } from '@/components/canvas/canvas-area';
import { PlaybackCaption } from './playback-caption';
import {
  ClassroomStatus,
  ClassroomNoticeView,
  BackgroundGenerationFailure,
  BackgroundGenerationAnnouncement,
} from './classroom-status';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClassroomChatPanel } from './classroom-chat';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { useClassroomLayout } from '@/lib/hooks/use-classroom-layout';
import { ClassroomResizeHandle } from './classroom-resize-handle';
import type { ClassroomViewProps } from './classroom-view-types';

/**
 * 课堂主界面：侧栏目录、画布播放、通知区、字幕与聊天面板；非 ready 时只展示状态页。
 */
export function ClassroomView(props: ClassroomViewProps) {
  const { t } = useI18n();
  const chatTrigger = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const learningArea = useRef<HTMLElement>(null);

  const { scene, directory, pageState = 'ready' } = props;
  const chatOpen = !!props.chat?.state.open;
  const ready = pageState === 'ready';
  const sidebarOpen = ready && !props.sidebarCollapsed;

  const layout = useClassroomLayout(shell, learningArea, sidebarOpen, chatOpen);

  const notices = props.notices ?? (props.notice ? [props.notice] : []);
  const sceneIndex = directory.findIndex((item) => item.sceneId !== null && item.sceneId === scene?.id);
  const courseEnd = props.allScenesReady && props.playback === 'ended' && sceneIndex === directory.length - 1 && sceneIndex >= 0;

  const showNoticeStrip = props.generation?.phase === 'failed' || notices.length > 0 || props.playback === 'ended';

  // 聊天打开时把 visualViewport 高度写入 --classroom-viewport-height，供 max-lg 布局使用。
  useEffect(() => {
    if (!chatOpen) return;
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
  }, [chatOpen, shell]);

  const toggleChat = () => {
    if (!props.chat) return;
    if (props.chat.state.open) props.chat.onClose();
    else props.chat.onOpen();
  };

  const closeChatPanel = () => {
    props.chat?.onClose();
    chatTrigger.current?.focus({ preventScroll: true });
  };

  const chatToggleControl = props.chat ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={chatTrigger}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t(props.chat.state.open ? 'chat.close' : 'chat.open')}
          aria-controls="classroom-chat"
          aria-expanded={props.chat.state.open}
          onClick={toggleChat}
        >
          <MessageCircle />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t(props.chat.state.open ? 'chat.close' : 'chat.open')}</TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <div
      ref={shell}
      style={layout.style}
      className="mindflow-surface classroom-shell relative isolate flex h-full min-h-0 flex-1 overflow-hidden text-foreground max-lg:max-h-[var(--classroom-viewport-height)]"
    >
      <GlobalControls chatOpen={chatOpen} />

      {ready && (
        <SceneSidebar
          directory={directory}
          currentSceneId={scene?.id ?? null}
          collapsed={props.sidebarCollapsed}
          onCollapseChange={props.onToggleSidebar}
          onSceneSelect={props.onSceneSelect}
          generation={props.generation}
          onRetryGeneration={props.onRetryGeneration}
        />
      )}

      {sidebarOpen && (
        <ClassroomResizeHandle
          axis="horizontal"
          control={{ ...layout.sidebar, label: t('classroom.resizeOutline') }}
        />
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col [@media(max-height:500px)]:overflow-y-auto">
        <div className={cn('flex min-w-0 shrink-0 items-center pr-28', chatOpen && 'max-lg:pr-3 max-lg:pt-14')}>
          <Header currentSceneTitle={scene?.title ?? ''} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <section
            ref={learningArea}
            aria-label={t('classroom.learningArea')}
            tabIndex={chatOpen ? 0 : undefined}
            className={cn('flex min-h-0 min-w-0 flex-1 flex-col', chatOpen && 'max-lg:overflow-y-auto max-lg:overscroll-contain')}
          >
            {pageState !== 'ready' ? (
              <ClassroomStatus state={pageState} generationUrl={props.generationUrl} onRead={props.onRead} />
            ) : (
              <>
                {props.generation && (
                  <BackgroundGenerationAnnouncement
                    state={props.generation}
                    ready={directory.filter((entry) => entry.ready).length}
                    total={directory.length}
                  />
                )}

                {showNoticeStrip && (
                  <section
                    aria-label={t('background.notices')}
                    tabIndex={0}
                    data-testid="classroom-notices"
                    className="flex max-h-[30dvh] shrink-0 flex-col gap-2 overflow-y-auto px-3 pb-2 [overflow-wrap:anywhere]"
                  >
                    {props.generation && (
                      <BackgroundGenerationFailure state={props.generation} onRetry={props.onRetryGeneration} />
                    )}
                    {notices.map((notice, noticeIndex) => (
                      <ClassroomNoticeView key={noticeIndex} notice={notice} />
                    ))}
                    {props.playback === 'ended' && (
                      <div>
                        <ClassroomNoticeView
                          notice={{
                            title: t(courseEnd ? 'classroom.lastPage' : 'classroom.sceneEnd'),
                            message: t(courseEnd ? 'classroom.lastPageHint' : 'classroom.sceneEndHint'),
                          }}
                        />
                        {courseEnd && (
                          <div className="flex flex-wrap items-center gap-2 py-2">
                            <Button variant="outline" onClick={props.onReplay} disabled={!props.onReplay}>
                              {t('classroom.replay')}
                            </Button>
                            <Button asChild variant="outline">
                              <Link href="/">{t('generation.backToHome')}</Link>
                            </Button>
                            {props.ungraded?.map((item) => (
                              <Button
                                variant="outline"
                                key={item.sceneId + item.questionId}
                                disabled={!props.onLocateQuestion}
                                onClick={() => props.onLocateQuestion?.(item.sceneId, item.questionId)}
                              >
                                {t('classroom.ungraded')}：{item.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                <div className={cn('flex min-h-0 flex-1 flex-col [@media(max-height:500px)]:min-h-72', chatOpen && 'max-lg:min-h-64')}>
                  <CanvasArea
                    currentScene={scene}
                    currentSceneIndex={sceneIndex}
                    scenesCount={directory.length}
                    engineState={props.playback}
                    sidebarCollapsed={props.sidebarCollapsed}
                    onToggleSidebar={props.onToggleSidebar}
                    onPrevSlide={props.onPrevious}
                    onNextSlide={props.onNext}
                    onPlayPause={props.onPlayPause}
                    onNextSegment={props.onNextSegment}
                    onReplay={props.onReplay}
                    isPresenting={props.isPresenting}
                    onTogglePresentation={props.onFullscreen}
                    quiz={props.quiz}
                    effects={props.effects}
                  />
                </div>

                <ClassroomResizeHandle
                  axis="vertical"
                  reverse
                  control={{ ...layout.caption, label: t('classroom.resizeCaption') }}
                />
                <PlaybackCaption
                  playback={props.playback}
                  subtitle={props.subtitle}
                  chatControl={chatToggleControl}
                />
              </>
            )}
          </section>
        </div>
      </main>

      {ready && chatOpen && (
        <ClassroomResizeHandle
          axis="horizontal"
          reverse
          control={{ ...layout.chat, label: t('classroom.resizeChat') }}
        />
      )}

      {ready && props.chat && (
        <ClassroomChatPanel
          chat={props.chat}
          expanded={props.chat.state.open}
          directory={directory}
          currentSceneTitle={scene?.title ?? ''}
          onClose={closeChatPanel}
        />
      )}
    </div>
  );
}