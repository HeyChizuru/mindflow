'use client';

import { useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ChatSession } from '@/lib/types/chat-session';
import type { ChatSessionPresentation } from './classroom-view-types';

export function ChatSessionList({ sessions }: { sessions: ChatSessionPresentation }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ChatSession | null>(null);
  const { state } = sessions;
  const label = (item: ChatSession) => item.isHistory ? t('chatSessions.history') : item.preview ?? t('chatSessions.new');
  const close = (value: boolean) => {
    setOpen(value);
    if (value) sessions.onRefresh(); else setConfirm(null);
  };
  return <div className="flex min-w-0 shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
    <Popover open={open} onOpenChange={close}>
      <PopoverTrigger asChild><Button type="button" variant="ghost" className="min-w-0 flex-1 justify-between" aria-label={t('chatSessions.list')}>
        <span className="min-w-0 truncate">{state.selected ? label(state.selected) : t('chatSessions.none')}</span>
        <ChevronDown data-icon="inline-end" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] flex-col rounded-md" data-classroom-chat
        onKeyDown={(event) => event.stopPropagation()}>
        <h3 className="mb-2 shrink-0 text-sm font-medium">{t('chatSessions.list')}</h3>
        {state.reading && <p role="status" className="py-2 text-xs text-muted-foreground">{t('chatSessions.reading')}</p>}
        {state.loaded && !state.sessions.length && <p className="py-2 text-sm text-muted-foreground">{t('chatSessions.empty')}</p>}
        <ul className="flex max-h-64 min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain" aria-label={t('chatSessions.list')}>
          {state.sessions.map((item) => <li key={item.id} className="flex min-w-0 items-center gap-1" data-session-id={item.id}>
            <Button type="button" variant={state.selected?.id === item.id ? 'secondary' : 'ghost'}
              className="h-auto min-w-0 flex-1 justify-start py-2 text-left" disabled={!!state.deletions[item.id] || state.selecting === item.id}
              aria-label={t('chatSessions.openSession', { title: label(item), course: item.stageName })}
              onClick={() => { sessions.onSelect(item); close(false); }}>
              {state.selecting === item.id ? <LoaderCircle className="animate-spin" data-icon="inline-start" />
                : state.selected?.id === item.id ? <Check data-icon="inline-start" /> : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm">{label(item)}</span>
                <span className="truncate text-xs text-muted-foreground">{item.stageName}</span>
                <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN', {
                  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
                })}</span>
              </span>
            </Button>
            {state.deletions[item.id] === 'unknown' && <Tooltip><TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t('chatSessions.checkDelete')}
                onClick={() => sessions.onCheckDeletion(item)}><RefreshCw /></Button>
            </TooltipTrigger><TooltipContent>{t('chatSessions.checkDelete')}</TooltipContent></Tooltip>}
            <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon"
              aria-label={t('chatSessions.deleteSession', { title: label(item) })} disabled={state.deletions[item.id] === 'deleting'}
              onClick={() => setConfirm(item)}>
              {state.deletions[item.id] === 'deleting' ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            </Button></TooltipTrigger><TooltipContent>{t('chatSessions.delete')}</TooltipContent></Tooltip>
          </li>)}
        </ul>
        {confirm && <section className="mt-3 flex shrink-0 flex-col gap-2 border-t border-border pt-3" aria-label={t('chatSessions.confirmTitle')}>
          <h4 className="text-sm font-medium">{t('chatSessions.confirmTitle')}</h4>
          <p className="text-sm [overflow-wrap:anywhere]">{label(confirm)}</p>
          <p className="text-xs text-muted-foreground">{t('chatSessions.confirmDescription')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => close(false)}>{t('chatSessions.cancel')}</Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => { sessions.onDelete(confirm); close(false); }}>
              <Trash2 data-icon="inline-start" />{t('chatSessions.confirmDelete')}
            </Button>
          </div>
        </section>}
      </PopoverContent>
    </Popover>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={t('chatSessions.create')}
      disabled={state.creating || !!state.selecting} onClick={sessions.onCreate}>
      {state.creating ? <LoaderCircle className="animate-spin" /> : <Plus />}
    </Button></TooltipTrigger><TooltipContent>{t('chatSessions.create')}</TooltipContent></Tooltip>
  </div>;
}
