'use client';

import { useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronDown, LoaderCircle, MessagesSquare, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ChatSession } from '@/lib/types/chat-session';
import type { ChatSessionPresentation } from './classroom-view-types';

export function ChatSessionList({ sessions }: { sessions: ChatSessionPresentation }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ChatSession | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { state } = sessions;
  const label = (item: ChatSession) => item.isHistory ? t('chatSessions.history') : item.preview ?? t('chatSessions.new');
  const close = (value: boolean) => {
    setOpen(value);
    if (value) sessions.onRefresh();
  };
  return <>
    <div className="flex min-w-0 shrink-0 items-center gap-2 px-3 pb-3">
      <Popover open={open} onOpenChange={close}>
        <PopoverTrigger asChild><Button ref={trigger} type="button" variant="outline" className="h-auto min-w-0 flex-1 justify-between py-2" aria-label={t('chatSessions.list')}>
          <MessagesSquare data-icon="inline-start" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <span className="truncate">{state.selected ? label(state.selected) : t('chatSessions.none')}</span>
            {state.selected && <span className="truncate text-xs font-normal text-muted-foreground">{state.selected.stageName}</span>}
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button></PopoverTrigger>
        <PopoverContent align="start" className="flex max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-1.5rem)] flex-col gap-3" data-classroom-chat
          onCloseAutoFocus={(event) => { if (confirm) event.preventDefault(); }}
          onKeyDown={(event) => event.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t('chatSessions.list')}</h3>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t('chatSessions.refresh')} disabled={state.reading} onClick={sessions.onRefresh}>
              <RefreshCw className={state.reading ? 'animate-spin motion-reduce:animate-none' : undefined} />
            </Button>
          </div>
          <p className="shrink-0 text-xs leading-5 text-muted-foreground">{t('chatSessions.navigationHint')}</p>
          <Separator />
          {state.reading && <p role="status" className="text-xs text-muted-foreground">{t('chatSessions.reading')}</p>}
          {state.error === 'readFailed' && <Alert variant="destructive"><AlertDescription>{t('chatSessions.error.readFailed')}</AlertDescription></Alert>}
          {state.loaded && !state.sessions.length && state.error !== 'readFailed' && <p className="py-4 text-center text-sm text-muted-foreground">{t('chatSessions.empty')}</p>}
          <ul className="classroom-scroll flex max-h-[min(24rem,55dvh)] min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain" aria-label={t('chatSessions.list')}>
            {state.sessions.map((item) => <li key={item.id} className="flex min-w-0 flex-col gap-1" data-session-id={item.id}>
              <div className="flex min-w-0 items-center gap-1">
                <Button type="button" variant={state.selected?.id === item.id ? 'secondary' : 'ghost'}
                  className="h-auto min-w-0 flex-1 items-start justify-start gap-2 py-2.5 text-left" disabled={!!state.deletions[item.id] || !!state.selecting || state.creating}
                  aria-current={state.selected?.id === item.id ? 'true' : undefined}
                  aria-label={t('chatSessions.openSession', { title: label(item), course: item.stageName })}
                  onClick={() => { sessions.onSelect(item); close(false); }}>
                  {state.selecting === item.id ? <LoaderCircle className="mt-0.5 animate-spin motion-reduce:animate-none" data-icon="inline-start" />
                    : state.selected?.id === item.id ? <Check className="mt-0.5" data-icon="inline-start" /> : <MessagesSquare className="mt-0.5" data-icon="inline-start" />}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 whitespace-normal text-sm leading-5 [overflow-wrap:anywhere]">{label(item)}</span>
                    <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                      <BookOpen className="shrink-0" /><span className="truncate">{item.stageName}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('zh-CN', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
                      })}</time>
                      {state.selected && item.stageId !== state.selected.stageId && <Badge variant="outline"><ArrowUpRight />{t('chatSessions.otherCourse')}</Badge>}
                    </span>
                  </span>
                </Button>
                {state.deletions[item.id] === 'unknown' && <Tooltip><TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label={t('chatSessions.checkDelete')}
                    onClick={() => sessions.onCheckDeletion(item)}><RefreshCw /></Button>
                </TooltipTrigger><TooltipContent>{t('chatSessions.checkDelete')}</TooltipContent></Tooltip>}
                <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon"
                  aria-label={t('chatSessions.deleteSession', { title: label(item) })} disabled={state.deletions[item.id] === 'deleting'}
                  onClick={() => { setConfirm(item); setOpen(false); }}>
                  {state.deletions[item.id] === 'deleting' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Trash2 />}
                </Button></TooltipTrigger><TooltipContent>{t('chatSessions.delete')}</TooltipContent></Tooltip>
              </div>
              {state.deletions[item.id] && <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">{t(state.deletions[item.id] === 'unknown' ? 'chatSessions.deletePending' : 'chatSessions.deleting')}</p>}
            </li>)}
          </ul>
        </PopoverContent>
      </Popover>
      <Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon-lg" aria-label={t('chatSessions.create')}
        disabled={state.creating || !!state.selecting} onClick={sessions.onCreate}>
        {state.creating ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Plus />}
      </Button></TooltipTrigger><TooltipContent>{t('chatSessions.create')}</TooltipContent></Tooltip>
    </div>
    <AlertDialog open={!!confirm} onOpenChange={(value) => { if (!value) setConfirm(null); }}>
      <AlertDialogContent data-classroom-chat className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-sm"
        onKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('chatSessions.confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('chatSessions.confirmDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirm && <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border p-3">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">{label(confirm)}</p>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{confirm.stageName}</p>
        </div>}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('chatSessions.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { if (confirm) sessions.onDelete(confirm); }}>
            <Trash2 data-icon="inline-start" />{t('chatSessions.confirmDelete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
