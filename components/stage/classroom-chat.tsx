'use client';

import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, FileText, Lightbulb, MapPin, MessageCircle, Plus, RefreshCw, RotateCcw, Wrench, X, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/components/ui/input-group';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Message, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message';
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from '@/components/ui/message-scroller';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CHAT_TEACHERS } from '@/lib/types/chat';
import type { ClassroomDirectoryEntry } from '@/lib/types/classroom';
import type { ClassroomChatItem } from '@/lib/client/classroom-chat';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useChatTypewriter } from '@/lib/hooks/use-chat-typewriter';
import { cn } from '@/lib/utils';
import type { ChatPresentation } from './classroom-view-types';
import { ChatSessionList } from './chat-session-list';
import { ChatMarkdown } from './chat-markdown';
import { ModelSettingsButton } from '@/components/model-settings-dialog';

const teacherIcons = { explainer: BookOpen, reasoning_coach: Lightbulb, application_coach: Wrench };

function itemStatus(item: ClassroomChatItem) {
  if (item.record?.status === 'completed') return 'chat.saved';
  if (item.checking) return 'chat.checking';
  if (item.issue) return 'chat.' + item.issue;
  if (item.busy && item.preview) return 'chat.phase.' + item.preview.phase;
  if (item.busy) return item.record ? 'chat.waitingSaved' : 'chat.waiting';
  if (item.record?.status === 'processing' && item.record.executionExpired) return 'chat.expired';
  return 'chat.' + (item.record?.status ?? 'unknown');
}

function ChatTurnView({ item, sceneTitle, onRead, onRecover }: {
  item: ClassroomChatItem; sceneTitle: string; onRead: () => void; onRecover: () => void;
}) {
  const { t } = useI18n();
  const { record } = item;
  const completed = record?.status === 'completed';
  const teacherId = record?.teacherId ?? item.preview?.teacherId;
  const TeacherIcon = teacherId ? teacherIcons[teacherId] : MessageCircle;
  const revealed = useChatTypewriter(completed ? record.reply! : item.preview?.text ?? '',
    item.preview?.executionId, completed || !item.preview?.active);
  const recoverable = !completed && item.issue !== 'conflict' && (item.issue === 'unsaved' || item.canResubmit
    || !item.issue && (record?.status === 'pending' || record?.status === 'failed' || record?.executionExpired));
  const error = !completed && (item.code ? t('chat.error.' + item.code)
    : record?.status === 'failed' ? t('chat.failure.' + record.failureCode) : null);
  return <div className="flex min-w-0 flex-col gap-5" data-testid="chat-turn"
    data-request-id={item.submission.requestId} data-status={record?.status ?? item.issue ?? 'waiting'}>
    <Message align="end" role="article" aria-label={t('chat.user')}>
      <MessageContent>
        <MessageHeader className="justify-end gap-2"><span>{t('chat.user')}</span>
          <span className="min-w-0 truncate" title={sceneTitle}>{sceneTitle}</span>
        </MessageHeader>
        <Bubble variant="secondary" align="end" className="max-w-[92%]">
          <BubbleContent><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item.submission.question}</p></BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
    {(completed || teacherId) && <Message role="article" aria-label={CHAT_TEACHERS[teacherId!]} aria-busy={!completed || revealed.typing}>
      <MessageContent>
        <MessageHeader className="gap-2"><TeacherIcon aria-hidden="true" className="size-4 text-primary" />
          <span className="text-foreground">{CHAT_TEACHERS[teacherId!]}</span>
          <span className="text-xs font-normal">{t('chat.teacher.' + teacherId)}</span>
        </MessageHeader>
        <Bubble variant="ghost" className="w-full"><BubbleContent className="w-full">
          <ChatMarkdown streaming={(!!item.preview?.active && item.preview.phase === 'answering') || revealed.typing}>{revealed.text}</ChatMarkdown>
        </BubbleContent></Bubble>
        {completed && !!record.sources?.length && <details className="group/sources min-w-0 rounded-lg border border-border bg-card/60">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <FileText aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{t('chat.sources', { count: record.sources.length })}</span>
            <ChevronDown aria-hidden="true" className="ml-auto size-3.5 transition-transform group-open/sources:rotate-180 motion-reduce:transition-none" />
          </summary>
          <ol className="flex min-w-0 flex-col gap-4 border-t border-border p-3">
            {record.sources.map((source, index) => <li key={source.chunkId} className="flex min-w-0 flex-col gap-2 text-xs [overflow-wrap:anywhere]">
              <p className="font-medium leading-5">[{index + 1}] {source.filename}{source.page !== null ? ' · ' + t('chat.page', { page: source.page }) : ''}</p>
              <p className="classroom-scroll max-h-44 overflow-y-auto whitespace-pre-wrap leading-6 text-muted-foreground" tabIndex={0}>{source.excerpt}</p>
            </li>)}
          </ol>
        </details>}
        <MessageFooter><span role="status" className="flex items-center gap-1.5 text-xs font-normal">
          {completed ? <Check className="size-3" aria-hidden="true" /> : <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {t(itemStatus(item))}
        </span></MessageFooter>
      </MessageContent>
    </Message>}
    {!completed && <div className="flex min-w-0 flex-col gap-3">
      {error ? <Alert variant="destructive"><AlertTitle>{t(itemStatus(item))}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
        : !teacherId && <p role="status" className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
          {(item.busy || item.checking) && <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />}
          {t(itemStatus(item))}
        </p>}
      <div className="flex flex-wrap gap-2">
        {error && <ModelSettingsButton />}
        <Button type="button" variant={item.issue === 'unknown' ? 'outline' : 'ghost'} size="sm" onClick={onRead} disabled={item.checking}>
          <RefreshCw data-icon="inline-start" />{t('chat.readTurn')}
        </Button>
        {recoverable && <Button type="button" variant="outline" size="sm" onClick={onRecover} disabled={item.busy || item.checking}>
          <RotateCcw data-icon="inline-start" />{t(item.canResubmit || item.issue === 'unsaved' ? 'chat.resubmit'
            : record?.status === 'pending' ? 'chat.continue' : 'chat.retry')}
        </Button>}
      </div>
    </div>}
  </div>;
}

export function ClassroomChatPanel({ chat, expanded, directory, currentSceneTitle, onClose }: {
  chat: ChatPresentation; expanded: boolean; directory: ClassroomDirectoryEntry[]; currentSceneTitle: string; onClose: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (expanded && chat.canSend && window.matchMedia('(min-width: 1024px)').matches) input.current?.focus({ preventScroll: true });
  }, [expanded, chat.canSend, chat.sessions.state.selected?.id]);
  const items = Object.values(chat.state.items).sort((a, b) => {
    if (a.record && b.record) return a.record.createdAt.localeCompare(b.record.createdAt) || a.record.id.localeCompare(b.record.id);
    return a.record ? -1 : b.record ? 1 : 0;
  });
  const sessions = chat.sessions.state;
  const currentSubmission = chat.state.draftRequestId ? chat.state.items[chat.state.draftRequestId] : null;
  const canSubmit = chat.canSend && !!chat.state.draft.trim()
    && (!currentSubmission || currentSubmission.issue === 'unsaved' && !currentSubmission.busy && !currentSubmission.checking);
  const inputHint = sessions.selecting ? 'chatSessions.opening' : sessions.creating ? 'chatSessions.creating'
    : !sessions.selected ? 'chat.selectFirst' : sessions.deletions[sessions.selected.id] ? 'chat.sessionLocked'
    : !chat.canSend ? 'chat.sceneUnavailable' : !canSubmit && currentSubmission ? 'chat.submitting' : 'chat.inputHint';
  const initialReading = !sessions.selected && (!sessions.loaded || !!sessions.selecting) && !sessions.error;
  return <aside id="classroom-chat" aria-labelledby="classroom-chat-title" aria-hidden={!expanded} inert={!expanded} data-classroom-chat
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
    }}
    className={cn('relative z-[60] flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-card shadow-xl transition-[flex-basis,opacity] duration-300 ease-in-out motion-reduce:transition-none',
      expanded ? 'basis-[min(28rem,70vw)] border-l border-border opacity-100 lg:basis-[var(--classroom-chat-width)]' : 'pointer-events-none basis-0 border-l-0 opacity-0')}>
    {expanded && <>
    <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-2 lg:py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <MessageCircle className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0"><h2 id="classroom-chat-title" className="text-sm font-semibold">{t('chat.title')}</h2>
          <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block max-lg:[@media(max-height:650px)]:hidden">{t('chat.teamHint')}</p>
        </div>
      </div>
      <div className="flex gap-1">
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={t('chat.readHistory')}
          onClick={chat.onRefresh} disabled={chat.state.reading || sessions.reading}><RefreshCw className={chat.state.reading || sessions.reading ? 'animate-spin motion-reduce:animate-none' : undefined} /></Button></TooltipTrigger><TooltipContent>{t('chat.readHistory')}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={t('chat.close')} onClick={onClose}><X /></Button></TooltipTrigger>
          <TooltipContent>{t('chat.close')}</TooltipContent></Tooltip>
      </div>
    </header>
    <ChatSessionList sessions={chat.sessions} />
    <Separator />
    <div className="flex min-h-0 flex-1 flex-col">
      {(sessions.error || chat.state.readFailed) && <div className="max-h-[35%] shrink-0 overflow-y-auto px-4 pt-3" tabIndex={0}>
        <Alert variant="destructive"><AlertDescription>
          {sessions.error ? t('chatSessions.error.' + sessions.error) : t('chat.readFailed')}
          <Button type="button" variant="outline" size="sm" onClick={chat.onRefresh} disabled={sessions.reading || chat.state.reading}>
            <RefreshCw data-icon="inline-start" />{t('chat.readHistory')}
          </Button>
        </AlertDescription></Alert>
      </div>}
      {sessions.selecting && sessions.selected && <p role="status" className="shrink-0 px-4 pt-3 text-xs text-muted-foreground">{t('chatSessions.opening')}</p>}
      <MessageScrollerProvider key={sessions.selected?.id ?? 'none'} autoScroll defaultScrollPosition="end">
        <MessageScroller>
          <MessageScrollerViewport className="classroom-scroll" aria-label={t('chat.history')} tabIndex={0}>
            <MessageScrollerContent className="gap-7 px-4 py-5">
              {(initialReading || chat.state.reading && !items.length) && <MessageScrollerItem messageId="loading">
                <div role="status" className="flex flex-col gap-4"><span className="text-xs text-muted-foreground">{t('chat.reading')}</span>
                  <Skeleton className="ml-auto h-12 w-3/4" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" />
                </div>
              </MessageScrollerItem>}
              {!sessions.selected && !initialReading && !sessions.selecting && !sessions.error && <MessageScrollerItem messageId="no-session" className="my-auto">
                <Empty><EmptyHeader><EmptyMedia variant="icon"><MessageCircle /></EmptyMedia><EmptyTitle>{t('chatSessions.none')}</EmptyTitle>
                  <EmptyDescription>{t('chat.noSessionHint')}</EmptyDescription></EmptyHeader>
                  <EmptyContent><Button type="button" variant="outline" disabled={sessions.creating} onClick={chat.sessions.onCreate}>
                    {sessions.creating ? <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Plus data-icon="inline-start" />}{t('chatSessions.create')}
                  </Button></EmptyContent>
                </Empty>
              </MessageScrollerItem>}
              {sessions.selected && chat.state.loaded && !chat.state.reading && !chat.state.readFailed && !items.length && <MessageScrollerItem messageId="empty" className="my-auto">
                <Empty><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{t('chat.empty')}</EmptyTitle>
                  <EmptyDescription>{t('chat.emptyHint')}</EmptyDescription></EmptyHeader>
                  <EmptyContent><div className="flex flex-wrap justify-center gap-2">
                    <Badge variant="secondary">{t('chat.teacher.explainer')}</Badge><Badge variant="secondary">{t('chat.teacher.reasoning_coach')}</Badge><Badge variant="secondary">{t('chat.teacher.application_coach')}</Badge>
                  </div></EmptyContent>
                </Empty>
              </MessageScrollerItem>}
              {items.map((item) => <MessageScrollerItem key={item.submission.requestId} messageId={item.submission.requestId}>
                <ChatTurnView item={item} sceneTitle={directory.find((entry) => entry.sceneId === item.submission.sceneId)?.title
                  ?? t('chat.sceneFallback', { id: item.submission.sceneId })}
                  onRead={() => chat.onRead(item.submission.requestId)} onRecover={() => chat.onRecover(item.submission.requestId)} />
              </MessageScrollerItem>)}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton aria-label={t('chat.latest')} size="sm" className="shadow-sm motion-reduce:transition-none">
            <ArrowDown data-icon="inline-start" />{t('chat.latest')}
          </MessageScrollerButton>
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
    <Separator />
    <form className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); if (canSubmit) chat.onSend(); }}>
      <FieldGroup><Field data-disabled={!chat.canSend} className="gap-2">
        <FieldLabel htmlFor="classroom-chat-input" className="sr-only">{t('chat.input')}</FieldLabel>
        <div className="flex min-w-0 items-center gap-1.5 px-1 text-xs text-muted-foreground" title={currentSceneTitle}>
          <MapPin className="size-3 shrink-0" aria-hidden="true" /><span className="shrink-0">{t('chat.context')}</span>
          <span className="truncate">{currentSceneTitle || t('chat.sceneUnavailable')}</span>
        </div>
        <InputGroup className="has-[[data-slot=input-group-control]:focus-visible]:ring-0 max-lg:[@media(max-height:650px)]:has-[>[data-align=block-end]]:flex-row">
          <InputGroupTextarea ref={input} id="classroom-chat-input" rows={2} value={chat.state.draft} disabled={!chat.canSend}
            aria-describedby="classroom-chat-input-hint" onChange={(event) => chat.onChange(event.target.value)}
            placeholder={t(sessions.selected ? 'chat.input' : 'chat.selectFirst')} className="max-h-36 min-h-12 lg:min-h-16 max-lg:[@media(max-height:650px)]:max-h-20 max-lg:[@media(max-height:650px)]:min-h-9" />
          <InputGroupAddon align="block-end" className="justify-end max-lg:[@media(max-height:650px)]:w-auto max-lg:[@media(max-height:650px)]:self-center max-lg:[@media(max-height:650px)]:py-2">
            <Button type="submit" variant="default" size="icon" className="rounded-full" disabled={!canSubmit} aria-label={t('chat.send')} title={t('chat.send')}>
              <ArrowUp aria-hidden="true" />
            </Button>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription id="classroom-chat-input-hint" className="px-1 text-xs">{t(inputHint)}</FieldDescription>
      </Field></FieldGroup>
    </form>
    </>}
  </aside>;
}
