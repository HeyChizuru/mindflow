import type { ChatSession } from '@/lib/types/chat-session';
import { ClassroomChat, type ClassroomChatState } from './classroom-chat';
import { ChatSessionRequestError, createChatSession, deleteChatSession, openChatSession, readChatSession, readChatSessions } from './chat-sessions';
import { readClassroom } from './classroom';

const emptyMessage: ClassroomChatState = { open: false, draft: '', draftRequestId: null, reading: false, loaded: false,
  readFailed: false, unavailable: false, items: {} };
export type ChatSessionsState = {
  open: boolean; sessions: ChatSession[]; selected: ChatSession | null; message: ClassroomChatState;
  reading: boolean; loaded: boolean; creating: boolean; selecting: string | null;
  deletions: Record<string, 'deleting' | 'unknown'>;
  error: 'readFailed' | 'createUnknown' | 'selectFailed' | 'deleteUnknown' | 'unavailable' | 'invalid' | null;
};
type Navigation = { replace: (id: string | null, open: boolean) => void; navigate: (session: ChatSession) => void };

/** The page owns selection; each child owns exactly one session's temporary messages. */
export class ClassroomChatSessions {
  private state: ChatSessionsState = { open: false, sessions: [], selected: null, message: emptyMessage,
    reading: false, loaded: false, creating: false, selecting: null, deletions: {}, error: null };
  private active = false;
  private epoch = 0;
  private intent = 0;
  private listSequence = 0;
  private revision = 0;
  private listeners = new Set<() => void>();
  private controllers = new Set<AbortController>();
  private children = new Map<string, ClassroomChat>();
  private deleted = new Set<string>();
  private child: ClassroomChat | null = null;
  private selection: string | undefined;
  private unsubscribeChild?: () => void;
  constructor(readonly stageId: string, private headers: (hasKnowledgeBase: boolean) => HeadersInit, private navigation: Navigation) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private patch(patch: Partial<ChatSessionsState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private controller() { const controller = new AbortController(); this.controllers.add(controller); return controller; }
  private current(epoch: number, intent?: number) { return this.active && this.epoch === epoch && (intent === undefined || intent === this.intent); }
  start = () => { this.active = true; this.epoch++; };
  dispose = () => {
    this.active = false; this.epoch++; this.intent++;
    this.controllers.forEach((controller) => controller.abort()); this.controllers.clear();
    this.unsubscribeChild?.(); this.child?.dispose(); this.child = null;
    this.state = { ...this.state, reading: false, creating: false, selecting: null,
      deletions: Object.fromEntries(Object.keys(this.state.deletions).map((id) => [id, 'unknown' as const])) };
  };
  private upsert(session: ChatSession) {
    if (this.deleted.has(session.id)) return;
    this.revision++;
    const sessions = [...this.state.sessions.filter((item) => item.id !== session.id), session]
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt) || b.id.localeCompare(a.id));
    this.patch({ sessions });
  }
  private adopt(session: ChatSession | null) {
    if (session && (this.deleted.has(session.id) || this.state.deletions[session.id])) return;
    if (session && this.child?.sessionId === session.id) { this.patch({ selected: session }); return; }
    this.unsubscribeChild?.(); this.child?.dispose(); this.child = null;
    if (!session) { this.patch({ selected: null, message: emptyMessage }); return; }
    const child = this.children.get(session.id) ?? new ClassroomChat(this.stageId, session.id, this.headers);
    this.children.set(session.id, child); this.child = child; child.start();
    this.unsubscribeChild = child.subscribe(() => {
      if (this.child !== child) return;
      const message = child.getSnapshot();
      if (message.unavailable) { this.remove(session.id); this.patch({ error: 'unavailable' }); }
      else this.patch({ message });
    });
    this.patch({ selected: session, message: child.getSnapshot() });
    if (this.state.open) child.open();
  }
  private remove(id: string) {
    this.deleted.add(id); this.revision++; this.listSequence++;
    const deletions = { ...this.state.deletions }; delete deletions[id];
    this.children.get(id)?.dispose(); this.children.delete(id);
    this.patch({ sessions: this.state.sessions.filter((session) => session.id !== id), deletions, reading: false });
    if (this.state.selected?.id === id) {
      this.adopt(null); this.navigation.replace(null, this.state.open);
    }
  }
  refreshList = async (): Promise<ChatSession[] | undefined> => {
    if (!this.active) return;
    const epoch = this.epoch, sequence = ++this.listSequence, revision = this.revision;
    const controller = this.controller(); this.patch({ reading: true });
    try {
      const sessions = await readChatSessions(controller.signal);
      if (!this.current(epoch) || sequence !== this.listSequence || revision !== this.revision) return;
      const visible = sessions.filter((session) => !this.deleted.has(session.id));
      this.patch({ sessions: visible, loaded: true,
        ...(this.state.selected ? { selected: visible.find((session) => session.id === this.state.selected?.id) ?? this.state.selected } : {}),
        ...(this.state.error === 'readFailed' ? { error: null } : {}) });
      return visible;
    } catch {
      if (this.current(epoch) && sequence === this.listSequence) this.patch({ error: 'readFailed' });
    } finally {
      this.controllers.delete(controller);
      if (this.current(epoch) && sequence === this.listSequence) this.patch({ reading: false });
    }
  };
  restore = async (selection: string | undefined, open: boolean) => {
    if (!this.active) return;
    this.selection = selection;
    this.patch({ open });
    if (selection && selection === this.child?.sessionId) {
      if (open && !this.state.deletions[selection] && !this.child.getSnapshot().open) this.child.open();
      return;
    }
    const epoch = this.epoch, intent = ++this.intent;
    this.patch({ selecting: null });
    this.adopt(null);
    if (selection === 'invalid') { this.patch({ error: 'invalid' }); return; }
    if (selection === 'none') { void this.refreshList(); return; }
    this.patch({ selecting: selection ?? 'default', error: null });
    const controller = this.controller();
    try {
      const sessions = await this.refreshList();
      if (!this.current(epoch, intent)) return;
      const session = selection ? await readChatSession(selection, controller.signal)
        : sessions?.find((item) => item.stageId === this.stageId) ?? null;
      if (!selection && sessions === undefined) return;
      if (!this.current(epoch, intent)) return;
      if (session && session.stageId !== this.stageId) throw new ChatSessionRequestError();
      if (session && this.deleted.has(session.id)) throw new ChatSessionRequestError('NOT_FOUND');
      this.adopt(session); this.navigation.replace(session?.id ?? null, this.state.open);
    } catch (error) {
      if (!this.current(epoch, intent)) return;
      if (error instanceof ChatSessionRequestError && error.code === 'NOT_FOUND') {
        if (selection) this.remove(selection);
        this.navigation.replace(null, open); this.patch({ error: 'unavailable' });
      } else this.patch({ error: 'selectFailed' });
    } finally {
      this.controllers.delete(controller);
      if (this.current(epoch, intent)) this.patch({ selecting: null });
    }
  };
  open = () => {
    this.patch({ open: true });
    if (!this.state.selecting) {
      this.navigation.replace(this.state.selected?.id ?? null, true); void this.refreshList();
    }
    if (!this.state.deletions[this.state.selected?.id ?? '']) this.child?.open();
  };
  close = () => {
    this.patch({ open: false });
    if (!this.state.selecting) this.navigation.replace(this.state.selected?.id ?? null, false);
    this.child?.close();
  };
  create = async () => {
    if (!this.active || this.state.creating) return;
    const epoch = this.epoch, intent = ++this.intent, controller = this.controller();
    this.patch({ creating: true, selecting: null, error: null });
    try {
      const session = await createChatSession(this.stageId, controller.signal);
      if (!this.current(epoch)) return;
      this.upsert(session);
      if (this.current(epoch, intent)) { this.adopt(session); this.navigation.replace(session.id, this.state.open); }
    } catch {
      if (this.current(epoch)) this.patch({ error: 'createUnknown' });
    } finally {
      this.controllers.delete(controller);
      if (this.current(epoch)) this.patch({ creating: false });
    }
  };
  select = async (session: ChatSession) => {
    if (!this.active || this.deleted.has(session.id) || this.state.deletions[session.id]) return;
    const epoch = this.epoch, intent = ++this.intent, controller = this.controller();
    this.patch({ selecting: session.id, error: null });
    try {
      const found = await readChatSession(session.id, controller.signal);
      const target = await readClassroom(found.stageId, controller.signal);
      if (target.state !== 'ready') throw new ChatSessionRequestError('NOT_READY');
      if (!this.current(epoch, intent) || this.deleted.has(session.id) || this.state.deletions[session.id]) return;
      const opened = await openChatSession(found, controller.signal);
      if (!this.current(epoch, intent) || this.deleted.has(session.id) || this.state.deletions[session.id]) return;
      this.upsert(opened);
      if (opened.stageId !== this.stageId) this.navigation.navigate(opened);
      else { this.adopt(opened); this.navigation.replace(opened.id, this.state.open); }
    } catch (error) {
      if (this.current(epoch, intent)) {
        if (error instanceof ChatSessionRequestError && error.code === 'NOT_FOUND') this.remove(session.id);
        this.patch({ error: 'selectFailed' });
      }
    } finally {
      this.controllers.delete(controller);
      if (this.current(epoch, intent)) this.patch({ selecting: null });
    }
  };
  delete = async (session: ChatSession) => {
    if (!this.active || this.deleted.has(session.id) || this.state.deletions[session.id] === 'deleting') return;
    const epoch = this.epoch, controller = this.controller();
    if (this.state.selected?.id === session.id) this.child?.dispose();
    this.patch({ deletions: { ...this.state.deletions, [session.id]: 'deleting' }, error: null });
    try {
      await deleteChatSession(session, controller.signal);
      if (this.current(epoch)) this.remove(session.id);
    } catch {
      if (this.current(epoch)) this.patch({ deletions: { ...this.state.deletions, [session.id]: 'unknown' }, error: 'deleteUnknown' });
    } finally { this.controllers.delete(controller); }
  };
  checkDeletion = async (session: ChatSession) => {
    if (!this.active || this.state.deletions[session.id] !== 'unknown') return;
    const epoch = this.epoch, controller = this.controller();
    try {
      await readChatSession(session.id, controller.signal);
      if (this.current(epoch)) this.patch({ error: 'deleteUnknown' });
    } catch (error) {
      if (this.current(epoch) && error instanceof ChatSessionRequestError && error.code === 'NOT_FOUND') this.remove(session.id);
      else if (this.current(epoch)) this.patch({ error: 'readFailed' });
    } finally { this.controllers.delete(controller); }
  };
  private writable() { return this.child && !this.state.creating && !this.state.selecting && !this.state.deletions[this.child.sessionId]; }
  changeDraft = (draft: string) => { if (this.writable()) this.child?.changeDraft(draft); };
  send = (sceneId: string, hasKnowledgeBase: boolean) => { if (this.writable()) return this.child?.send(sceneId, hasKnowledgeBase); };
  readItem = (id: string) => { if (this.writable()) return this.child?.readItem(id); };
  recover = (id: string, hasKnowledgeBase: boolean) => { if (this.writable()) return this.child?.recover(id, hasKnowledgeBase); };
  refresh = async () => {
    this.patch({ error: null });
    if (!this.child && this.selection !== 'none') await this.restore(this.selection, this.state.open);
    else { await this.refreshList(); if (this.writable()) await this.child?.refresh(); }
  };
}
