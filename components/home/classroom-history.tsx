'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronDown, ChevronUp, Clock3, Loader2, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useClassroomHistory } from '@/lib/hooks/use-classroom-history';
import { usePendingDeletions } from '@/lib/hooks/use-pending-deletions';
import { deleteHistoryItem, HistoryRequestError, readHistoryItem, renameHistoryItem } from '@/lib/client/stages/history';
import { renameStageSchema } from '@/lib/validators/stage-history';
import type { StageHistoryItem } from '@/lib/types/stage-history';
import { HistoryPreview } from './history-preview';

const phases = { draft: '未定稿', first_scene_pending: '首场未就绪', partial: '部分就绪', ready: '全部就绪', invalid: '数据异常' };
function pageLabel(item: StageHistoryItem) {
  return item.totalPages === null ? phases[item.phase] : item.phase === 'ready' ? `${item.totalPages} 页` : `已生成 ${item.readyPages} / ${item.totalPages} 页`;
}
function createdLabel(value: string) {
  const days = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 86400000);
  return days === 0 ? '今天创建' : days === 1 ? '昨天创建' : days < 30 ? `${days} 天前创建` : `${new Date(value).toLocaleDateString('zh-CN')} 创建`;
}

export function ClassroomHistory() {
  const history = useClassroomHistory();
  const deletions = usePendingDeletions();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState<{ type: 'rename' | 'delete'; item: StageHistoryItem } | null>(null);
  const [name, setName] = useState('');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);
  const busyRef = useRef(false);
  const entryRef = useRef(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLButtonElement | null>(null);

  function open(type: 'rename' | 'delete', item: StageHistoryItem, target: HTMLButtonElement) {
    anchor.current = target; setName(item.name); setOperationError(null); setCleanupPending(false); setDialog({ type, item });
  }
  function restoreFocus(event: Event) {
    event.preventDefault();
    (anchor.current?.isConnected ? anchor.current : heading.current)?.focus();
  }
  async function enter(item: StageHistoryItem) {
    if (entryRef.current) return;
    entryRef.current = true; setEntering(item.id);
    try {
      const current = await readHistoryItem(item.id);
      if (current.phase === 'invalid') throw new Error('已保存的课堂数据异常，请重读或检查课堂数据');
      router.push(`/${current.phase === 'draft' || current.phase === 'first_scene_pending' ? 'generation-preview' : 'classroom'}/${current.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '进入课堂失败，请重试');
      void history.refresh();
    } finally { entryRef.current = false; setEntering(null); }
  }
  async function rename() {
    if (!dialog || busyRef.current) return;
    const parsed = renameStageSchema.safeParse({ name });
    if (!parsed.success) { setOperationError(parsed.error.issues[0].message); return; }
    busyRef.current = true; setBusy(true); setOperationError(null); history.invalidate();
    let saved = false;
    try { await renameHistoryItem(dialog.item.id, parsed.data.name); saved = true; }
    catch (cause) {
      try { const current = await readHistoryItem(dialog.item.id); saved = current.name === parsed.data.name; }
      catch { /* Reading failure is not evidence of a completed save. */ }
      if (!saved) setOperationError(cause instanceof Error ? cause.message : '保存结果尚未确认，请重试');
    } finally { busyRef.current = false; setBusy(false); }
    if (saved) { toast.success('课堂名称已保存'); setDialog(null); }
    void history.refresh();
  }
  async function remove() {
    if (!dialog || busyRef.current) return;
    busyRef.current = true; setBusy(true); setOperationError(null); history.invalidate();
    deletions.remember(dialog.item);
    try {
      let result;
      try { result = await deleteHistoryItem(dialog.item.id); }
      catch (cause) {
        // A lost DELETE response is ambiguous. Re-read before retrying file cleanup.
        try { await readHistoryItem(dialog.item.id); }
        catch (readError) {
          if (readError instanceof HistoryRequestError && readError.status === 404) result = await deleteHistoryItem(dialog.item.id);
        }
        if (!result) throw cause;
      }
      if (result.filesDeleted) { deletions.forget(dialog.item.id); toast.success('课堂及关联数据已永久删除'); setDialog(null); }
      else {
        setCleanupPending(true);
        setOperationError('课堂记录已删除，PDF 文件清理尚未完成。请重试清理。');
      }
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : '删除结果尚未确认，请重新核对'); }
    finally { busyRef.current = false; setBusy(false); void history.refresh(); }
  }
  async function reconcileDeletion(id: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      try {
        await readHistoryItem(id);
        deletions.forget(id);
        toast('课堂仍存在；如需删除，请从卡片重新确认。');
        return;
      } catch (cause) {
        if (!(cause instanceof HistoryRequestError) || cause.status !== 404) throw cause;
      }
      const result = await deleteHistoryItem(id);
      if (result.filesDeleted) { deletions.forget(id); toast.success('已核对：课堂与文件均已删除'); }
      else toast.error('课堂已删除，PDF 文件清理仍未完成，请稍后重试。');
    } catch { toast.error('仍无法核对删除或清理结果，请稍后重试。'); }
    finally { busyRef.current = false; setBusy(false); void history.refresh(); }
  }

  return <section aria-label="历史课堂" className="relative w-full max-w-6xl pb-12">
    <div className="mb-7 flex flex-wrap items-center justify-center gap-3">
      <Separator className="hidden flex-1 sm:block" />
      <Button ref={heading} variant="ghost" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="classroom-history-list">
        <Clock3 data-icon="inline-start" />历史课堂
        <span className="tabular-nums text-muted-foreground">{history.loading && !history.page.total ? '…' : history.page.total}</span>
        {expanded ? <ChevronUp data-icon="inline-end" /> : <ChevronDown data-icon="inline-end" />}
      </Button>
      <Button variant="ghost" size="icon" aria-label="刷新历史课堂" disabled={history.loading} onClick={() => void history.refresh()}><RefreshCw /></Button>
      <Separator className="hidden flex-1 sm:block" />
    </div>

    {deletions.pending.length > 0 && <Alert className="mb-5"><AlertTitle>有删除或文件清理结果待核对</AlertTitle><AlertDescription><div className="mt-2 flex flex-col gap-2">{deletions.pending.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2"><span className="break-all">{item.name}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => void reconcileDeletion(item.id)}>核对并重试清理</Button></div>)}</div></AlertDescription></Alert>}
    <div id="classroom-history-list" hidden={!expanded}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{history.query ? `找到 ${history.page.matched} 节课堂` : '每一次探索，都可以从这里继续。'}</p>
        <div className="relative w-full sm:w-64">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="搜索课堂标题" placeholder="搜索课堂标题" value={history.search} maxLength={100} onChange={event => history.setSearch(event.target.value)} className="pl-9 pr-9" />
          {history.search && <Button variant="ghost" size="icon-sm" className="absolute right-0.5 top-0.5" aria-label="清空搜索" onClick={() => history.setSearch('')}><X /></Button>}
        </div>
      </div>

      {history.error && <Alert variant="destructive" className="mb-5"><AlertTitle>历史课堂读取失败</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{history.error}<Button variant="outline" size="sm" onClick={() => void history.refresh()}>重新读取</Button></AlertDescription></Alert>}

      <div aria-busy={history.loading} className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {history.page.items.map(item => <article key={item.id} className="group min-w-0">
          <div className="relative">
            <button type="button" onClick={() => void enter(item)} disabled={entering !== null} aria-label={`进入课堂：${item.name}`} className="block aspect-video w-full overflow-hidden rounded-2xl border border-border/40 bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
              <HistoryPreview item={item} />
              {entering === item.id && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/70"><Loader2 aria-label="正在读取课堂" className="size-6 animate-spin" /></span>}
            </button>
            <div className="absolute right-3 top-3 flex gap-1 rounded-full border border-border/40 bg-background/95 p-1 shadow-sm">
              <Button variant="ghost" size="icon-sm" aria-label={`重命名课堂：${item.name}`} title="重命名" onClick={event => open('rename', item, event.currentTarget)}><Pencil /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`删除课堂：${item.name}`} title="删除课堂" onClick={event => open('delete', item, event.currentTarget)}><Trash2 /></Button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 px-1">
            <button type="button" onClick={() => void enter(item)} disabled={entering !== null} className="line-clamp-2 w-fit text-left text-base font-semibold leading-relaxed hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={item.name}>{item.name}</button>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{pageLabel(item)}</Badge>
              {item.totalPages !== null && <span>{phases[item.phase]}</span>}
              <time dateTime={item.createdAt} title={`创建于 ${new Date(item.createdAt).toLocaleString('zh-CN')}`}>{createdLabel(item.createdAt)}</time>
            </div>
          </div>
        </article>)}
        {history.loading && history.page.items.length === 0 && Array.from({ length: 3 }, (_, index) => <div key={index} className="flex flex-col gap-3"><Skeleton className="aspect-video w-full rounded-2xl" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>)}
      </div>
      {!history.loading && !history.error && history.page.items.length === 0 && <Empty><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{history.query ? '没有找到匹配的课堂' : '还没有历史课堂'}</EmptyTitle><EmptyDescription>{history.query ? '试试其他标题关键词，或清空搜索。' : '在上方创建一节课堂，之后就能从这里继续。'}</EmptyDescription></EmptyHeader>{history.query && <Button variant="outline" onClick={() => history.setSearch('')}>清空搜索</Button>}</Empty>}
      {history.page.nextCursor && <div className="mt-8 flex justify-center"><Button variant="outline" disabled={history.loading} onClick={history.more}>{history.loading && <Loader2 className="animate-spin" data-icon="inline-start" />}{history.loading ? '正在加载' : '加载更多'}</Button></div>}
    </div>

    <Dialog open={dialog?.type === 'rename'} onOpenChange={open => { if (!open && !busyRef.current) setDialog(null); }}>
      <DialogContent showCloseButton={!busy} onCloseAutoFocus={restoreFocus}>
        <form onSubmit={event => { event.preventDefault(); void rename(); }} className="flex flex-col gap-5">
          <DialogHeader><DialogTitle>重命名课堂</DialogTitle><DialogDescription>只修改课堂名称，已有内容与学习记录将保留。</DialogDescription></DialogHeader>
          <Field data-invalid={!!operationError}><FieldLabel htmlFor="history-classroom-name">课堂名称</FieldLabel><Input id="history-classroom-name" value={name} onChange={event => { setName(event.target.value); setOperationError(null); }} maxLength={100} disabled={busy} aria-invalid={!!operationError} aria-describedby={operationError ? 'history-rename-error' : undefined} />{operationError && <FieldError id="history-rename-error">{operationError}</FieldError>}</Field>
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>取消</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" data-icon="inline-start" />}{busy ? '正在核对保存' : '保存名称'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={dialog?.type === 'delete'} onOpenChange={open => { if (!open && !busyRef.current) setDialog(null); }}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader><AlertDialogTitle>{cleanupPending ? '课堂已删除，文件待清理' : '永久删除这节课堂？'}</AlertDialogTitle><AlertDialogDescription asChild><div className="flex flex-col gap-3"><p className="break-words font-medium text-foreground">{dialog?.item.name}</p><p>这会永久删除课堂、所有场景和讲稿、播放位置、测验答案和成绩、聊天会话及消息，以及 PDF 原件和知识库。此操作无法撤销。</p></div></AlertDialogDescription></AlertDialogHeader>
        {operationError && <Alert variant="destructive"><AlertDescription>{operationError}</AlertDescription></Alert>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{cleanupPending ? '稍后处理' : '取消'}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy && <Loader2 className="animate-spin" data-icon="inline-start" />}{busy ? '正在核对删除' : cleanupPending ? '重试文件清理' : '永久删除'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
