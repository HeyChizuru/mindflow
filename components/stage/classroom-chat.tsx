'use client';

import { useEffect, useRef } from 'react';
import { MessageCircle, RefreshCw, RotateCcw, Send, X, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CHAT_TEACHERS } from '@/lib/types/chat';
import type { ClassroomDirectoryEntry } from '@/lib/types/classroom';
import type { ClassroomChatItem } from '@/lib/client/classroom-chat';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ChatPresentation } from './classroom-view-types';
import { ChatSessionList } from './chat-session-list';

function itemStatus(item: ClassroomChatItem) {
  if (item.record?.status === 'completed') return 'chat.saved';
  if (item.issue) return 'chat.' + item.issue;
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
  const recoverable = !completed && item.issue !== 'conflict' && (item.issue === 'unsaved' || item.canResubmit
    || !item.issue && (record?.status === 'pending' || record?.status === 'failed' || record?.executionExpired));
  return <li className="flex min-w-0 flex-col gap-3 border-b border-border py-4 last:border-0" data-testid="chat-turn"
    data-request-id={item.submission.requestId} data-status={record?.status ?? item.issue ?? 'waiting'}>
    <article className="flex min-w-0 flex-col gap-1" aria-label={t('chat.user')}>
      <p className="text-xs text-muted-foreground">{t('chat.user')} · {sceneTitle}</p>
      <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{item.submission.question}</p>
    </article>
    {completed && <article className="flex min-w-0 flex-col gap-2 border-l-2 border-primary pl-3" aria-label={CHAT_TEACHERS[record.teacherId!]}>
      <h3 className="text-sm font-medium">{CHAT_TEACHERS[record.teacherId!]}</h3>
      <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{record.reply}</p>
      {!!record.sources?.length && <details className="min-w-0 text-sm">
        <summary className="cursor-pointer py-1 text-muted-foreground">{t('chat.sources', { count: record.sources.length })}</summary>
        <ol className="flex min-w-0 flex-col gap-3 py-2">
          {record.sources.map((source, index) => <li key={source.chunkId} className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]">
            <p className="font-medium">[{index + 1}] {source.filename}{source.page !== null ? ' · ' + t('chat.page', { page: source.page }) : ''}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{source.excerpt}</p>
          </li>)}
        </ol>
      </details>}
    </article>}
    <div className="flex flex-col gap-2">
      <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {(item.busy || item.checking) && <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />}
        {t(itemStatus(item))}
      </p>
      {!completed && item.code && <Alert variant="destructive"><AlertDescription>{t('chat.error.' + item.code)}</AlertDescription></Alert>}
      {record?.status === 'failed' && !item.code && <Alert variant="destructive"><AlertDescription>{t('chat.failure.' + record.failureCode)}</AlertDescription></Alert>}
      {!completed && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onRead} disabled={item.checking}>
          <RefreshCw data-icon="inline-start" />{t('chat.readTurn')}
        </Button>
        {recoverable && <Button type="button" variant="outline" size="sm" onClick={onRecover} disabled={item.busy || item.checking}>
          <RotateCcw data-icon="inline-start" />{t(item.canResubmit || item.issue === 'unsaved' ? 'chat.resubmit'
            : record?.status === 'pending' ? 'chat.continue' : 'chat.retry')}
        </Button>}
      </div>}
    </div>
  </li>;
}

export function ClassroomChatPanel({ chat, directory, onClose }: {
  chat: ChatPresentation; directory: ClassroomDirectoryEntry[]; onClose: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (chat.canSend) input.current?.focus({ preventScroll: true }); }, [chat.canSend, chat.sessions.state.selected?.id]);
  const items = Object.values(chat.state.items).sort((a, b) => {
    if (a.record && b.record) return a.record.createdAt.localeCompare(b.record.createdAt) || a.record.id.localeCompare(b.record.id);
    return a.record ? -1 : b.record ? 1 : 0;
  });
  const currentSubmission = chat.state.draftRequestId ? chat.state.items[chat.state.draftRequestId] : null;
  const canSubmit = chat.canSend && !!chat.state.draft.trim()
    && (!currentSubmission || currentSubmission.issue === 'unsaved' && !currentSubmission.busy && !currentSubmission.checking);
  return <aside id="classroom-chat" aria-labelledby="classroom-chat-title" data-classroom-chat
    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}
    className="flex h-[55%] min-h-52 min-w-0 shrink-0 flex-col border-t border-border bg-background lg:h-full lg:w-96 lg:max-w-[42%] lg:border-t-0 lg:border-l">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <h2 id="classroom-chat-title" className="text-sm font-semibold">{t('chat.title')}</h2>
      <div className="flex gap-1">
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={t('chat.readHistory')}
          onClick={chat.onRefresh} disabled={chat.state.reading}><RefreshCw /></Button></TooltipTrigger><TooltipContent>{t('chat.readHistory')}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={t('chat.close')} onClick={onClose}><X /></Button></TooltipTrigger>
          <TooltipContent>{t('chat.close')}</TooltipContent></Tooltip>
      </div>
    </div>
    <ChatSessionList sessions={chat.sessions} />
    <section aria-label={t('chat.history')} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
      {chat.sessions.state.error && <Alert variant="destructive" className="my-3"><AlertDescription>
        {t('chatSessions.error.' + chat.sessions.state.error)}
      </AlertDescription></Alert>}
      {chat.sessions.state.selecting && <p role="status" className="py-3 text-sm text-muted-foreground">{t('chatSessions.opening')}</p>}
      {!chat.sessions.state.selected && !chat.sessions.state.selecting && <Empty>
        <EmptyHeader><EmptyMedia variant="icon"><MessageCircle /></EmptyMedia><EmptyTitle>{t('chatSessions.none')}</EmptyTitle></EmptyHeader>
      </Empty>}
      {chat.state.reading && <p role="status" className="py-3 text-sm text-muted-foreground">{t('chat.reading')}</p>}
      {chat.state.readFailed && <Alert variant="destructive" className="my-3"><AlertDescription>{t('chat.readFailed')}</AlertDescription></Alert>}
      {chat.sessions.state.selected && chat.state.loaded && !chat.state.reading && !chat.state.readFailed && !items.length && <Empty>
        <EmptyHeader><EmptyMedia variant="icon"><MessageCircle /></EmptyMedia><EmptyTitle>{t('chat.empty')}</EmptyTitle></EmptyHeader>
      </Empty>}
      <ol className="min-w-0">
        {items.map((item) => <ChatTurnView key={item.submission.requestId} item={item}
          sceneTitle={directory.find((entry) => entry.sceneId === item.submission.sceneId)?.title
            ?? t('chat.sceneFallback', { id: item.submission.sceneId })}
          onRead={() => chat.onRead(item.submission.requestId)} onRecover={() => chat.onRecover(item.submission.requestId)} />)}
      </ol>
    </section>
    <form className="flex shrink-0 flex-col gap-2 border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); if (canSubmit) chat.onSend(); }}>
      <FieldGroup><Field><FieldLabel htmlFor="classroom-chat-input" className="sr-only">{t('chat.input')}</FieldLabel>
        <Textarea ref={input} id="classroom-chat-input" rows={2} value={chat.state.draft} disabled={!chat.canSend} onChange={(event) => chat.onChange(event.target.value)}
          placeholder={t('chat.input')} className="max-h-32 min-h-16 resize-y" />
      </Field></FieldGroup>
      <div className="flex justify-end"><Button type="submit" variant="action" disabled={!canSubmit}><Send data-icon="inline-start" />{t('chat.send')}</Button></div>
    </form>
  </aside>;
}
