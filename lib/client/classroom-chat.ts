import type { ChatErrorCode, ChatRequest, ChatTurn, SubmitChat } from '@/lib/types/chat';
import { readChatSchema, submitChatSchema } from '@/lib/validators/chat';
import { ChatRequestError, readChat, sendChat } from './chat';
import type { ChatPhase } from '@/lib/types/chat-stream';
import type { ChatTeacherId } from '@/lib/types/chat';

export type ClassroomChatItem = {
  submission: SubmitChat;
  record?: ChatTurn;
  busy: boolean;
  checking: boolean;
  issue?: 'unsaved' | 'unknown' | 'conflict';
  code?: ChatErrorCode;
  canResubmit?: boolean;
  preview?: { executionId: string; text: string; phase: ChatPhase; teacherId: ChatTeacherId | null; active: boolean };
};
export type ClassroomChatState = {
  open: boolean;
  draft: string;
  draftRequestId: string | null;
  reading: boolean;
  loaded: boolean;
  readFailed: boolean;
  unavailable: boolean;
  items: Record<string, ClassroomChatItem>;
};

/** Page-local interaction state. Saved records and execution ownership come only from the API. */
export class ClassroomChat {
  private state: ClassroomChatState = {
    open: false, draft: '', draftRequestId: null, reading: false, loaded: false, readFailed: false, unavailable: false, items: {},
  };
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;
  private readSequence = 0;
  private revision = 0;
  private writes = new Map<string, number>();
  private operations = new Set<string>();
  private controllers = new Set<AbortController>();
  readonly stageId: string;
  readonly sessionId: string;
  constructor(stageId: string, sessionId: string, private headers: (hasKnowledgeBase: boolean) => HeadersInit) {
    this.stageId = stageId.toLowerCase();
    this.sessionId = sessionId.toLowerCase();
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private patch(patch: Partial<ClassroomChatState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private update(id: string, patch: Partial<ClassroomChatItem>) {
    const item = this.state.items[id];
    if (item) this.patch({ items: { ...this.state.items, [id]: { ...item, ...patch } } });
  }
  private touch(id: string) { this.writes.set(id, ++this.revision); }
  private controller() { const controller = new AbortController(); this.controllers.add(controller); return controller; }
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  start = () => {
    if (this.active) return;
    this.active = true; this.epoch++;
  };
  dispose = () => {
    this.active = false; this.epoch++;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear(); this.operations.clear();
    // Strict Mode may start this same instance again; in-flight outcomes are unknown, not failed.
    this.state = { ...this.state, reading: false, items: Object.fromEntries(Object.entries(this.state.items)
      .map(([id, item]) => [id, { ...item, busy: false, checking: false, preview: undefined,
        ...(item.busy ? { issue: 'unknown' as const } : {}) }])) };
  };
  open = () => { this.patch({ open: true }); void this.refresh(); };
  close = () => this.patch({ open: false });
  changeDraft = (draft: string) => this.patch({ draft, draftRequestId: null });
  private missing(error: unknown) {
    if (!(error instanceof ChatRequestError) || error.payload?.code !== 'SESSION_UNAVAILABLE') return false;
    this.patch({ unavailable: true, items: {}, draft: '', draftRequestId: null });
    return true;
  }

  private merge(record: ChatTurn): boolean {
    const id = record.requestId;
    const item = this.state.items[id];
    if (record.stageId !== this.stageId || record.sessionId !== this.sessionId || this.state.unavailable) return false;
    if (item && (item.submission.sceneId !== record.sceneId || item.submission.question !== record.question)) {
      this.update(id, { issue: 'conflict', code: 'IDENTITY_CONFLICT' });
      return false;
    }
    const old = item?.record;
    if (old && (old.id !== record.id || old.updatedAt > record.updatedAt
      || old.status === 'completed' && record.status !== 'completed'
      || old.status === 'processing' && record.status === 'processing'
        && old.executionId === record.executionId && old.executionExpired && !record.executionExpired)) return false;
    const submission = { stageId: record.stageId, sessionId: record.sessionId, sceneId: record.sceneId, requestId: id, question: record.question };
    const sameFailure = record.status === 'failed' && old?.status === 'failed' && old.executionId === record.executionId;
    const preview = item?.preview?.executionId === record.executionId ? item.preview : undefined;
    this.patch({ items: { ...this.state.items, [id]: { ...item, submission, record,
      preview: preview && record.status === 'completed' ? { ...preview, text: record.reply!, active: false } : preview,
      busy: item?.busy ?? false, checking: item?.checking ?? false, issue: undefined,
      code: sameFailure && item?.code !== 'READ_FAILED' && item?.code !== 'SAVE_UNKNOWN' ? item?.code : undefined, canResubmit: false } },
      ...(this.state.draftRequestId === id ? { draft: '', draftRequestId: null } : {}) });
    return true;
  }

  refresh = async () => {
    if (!this.active || this.state.unavailable || !readChatSchema.safeParse({ stageId: this.stageId, sessionId: this.sessionId }).success) return;
    const epoch = this.epoch, sequence = ++this.readSequence, revision = this.revision;
    const controller = this.controller();
    this.patch({ reading: true, readFailed: false });
    try {
      const records = await readChat({ stageId: this.stageId, sessionId: this.sessionId }, controller.signal);
      if (!this.current(epoch) || sequence !== this.readSequence) return;
      for (const record of records) {
        if ((this.writes.get(record.requestId) ?? 0) <= revision) this.merge(record);
      }
      this.patch({ loaded: true });
    } catch (error) {
      if (this.current(epoch) && sequence === this.readSequence && !this.missing(error)) this.patch({ readFailed: true });
    } finally {
      this.controllers.delete(controller);
      if (this.current(epoch) && sequence === this.readSequence) this.patch({ reading: false });
    }
  };

  send = async (sceneId: string, hasKnowledgeBase: boolean) => {
    if (!this.active || this.state.unavailable) return;
    const existing = this.state.draftRequestId && this.state.items[this.state.draftRequestId];
    if (existing) {
      if (existing.issue === 'unsaved') await this.recover(existing.submission.requestId, hasKnowledgeBase);
      return;
    }
    const parsed = submitChatSchema.safeParse({ stageId: this.stageId, sessionId: this.sessionId, sceneId,
      requestId: crypto.randomUUID(), question: this.state.draft });
    if (!parsed.success) return;
    const submission = parsed.data;
    this.patch({ draftRequestId: submission.requestId, items: { ...this.state.items,
      [submission.requestId]: { submission, busy: false, checking: false } } });
    await this.perform(submission.requestId, submission, hasKnowledgeBase);
  };

  private async perform(id: string, request: ChatRequest, hasKnowledgeBase: boolean) {
    if (!this.active || this.state.unavailable || this.operations.has(id)) return;
    const epoch = this.epoch;
    this.operations.add(id); this.touch(id);
    this.update(id, { busy: true, code: undefined, issue: undefined, canResubmit: false, preview: undefined });
    const controller = this.controller();
    try {
      let headers: HeadersInit = {};
      try { headers = this.headers(hasKnowledgeBase); } catch { /* Let the server preserve the question and report missing configuration. */ }
      const record = await sendChat(request, headers, controller.signal, (event) => {
        if (!this.current(epoch) || this.state.unavailable || this.state.items[id]?.record?.status === 'completed') return;
        this.touch(id);
        if (event.type === 'record' || event.type === 'start') {
          if (!this.merge(event.record)) return;
          if (event.type === 'start') this.update(id, { preview: { executionId: event.record.executionId!,
            text: '', phase: 'preparing', teacherId: null, active: true } });
          return;
        }
        const preview = this.state.items[id]?.preview;
        if (!preview || preview.executionId !== event.identity.executionId) return;
        if (event.type === 'progress') this.update(id, { preview: { ...preview, phase: event.phase,
          teacherId: event.teacherId ?? preview.teacherId } });
        else if (event.type === 'answer') this.update(id, { preview: { ...preview, text: event.reply, teacherId: event.teacherId } });
        else {
          if (preview.text.length + event.text.length > 12000) throw new ChatRequestError();
          this.update(id, { preview: { ...preview, text: preview.text + event.text } });
        }
      });
      if (!this.current(epoch)) return;
      this.touch(id);
      this.merge(record);
    } catch (error) {
      if (!this.current(epoch)) return;
      if (this.missing(error)) return;
      this.touch(id);
      const payload = error instanceof ChatRequestError ? error.payload : null;
      if (payload?.record && !this.merge(payload.record)) return;
      const record = this.state.items[id]?.record;
      if (record?.status !== 'completed') this.update(id, {
        preview: undefined,
        code: payload?.code,
        issue: payload?.code === 'IDENTITY_CONFLICT' ? 'conflict'
          : payload?.code === 'SAVE_UNKNOWN' || !payload || payload.questionSaved === null || !record && payload.questionSaved !== false ? 'unknown'
          : payload.questionSaved === false ? record ? 'unknown' : 'unsaved' : undefined,
      });
    } finally {
      this.controllers.delete(controller);
      if (this.current(epoch)) {
        this.operations.delete(id);
        const preview = this.state.items[id]?.preview;
        this.update(id, { busy: false, ...(preview ? { preview: { ...preview, active: false } } : {}) });
      }
    }
  }

  readItem = async (id: string): Promise<ChatTurn | null | undefined> => {
    const item = this.state.items[id];
    if (!this.active || this.state.unavailable || !item || item.checking) return undefined;
    const epoch = this.epoch, revision = this.writes.get(id);
    const controller = this.controller();
    this.update(id, { checking: true });
    try {
      const records = await readChat(item.record ? { stageId: this.stageId, sessionId: this.sessionId, turnId: item.record.id }
        : { stageId: this.stageId, sessionId: this.sessionId, requestId: id }, controller.signal);
      if (!this.current(epoch) || revision !== this.writes.get(id)) return undefined;
      const record = records[0];
      if (record) {
        if (record.requestId !== id || record.sceneId !== item.submission.sceneId || record.question !== item.submission.question) {
          throw new ChatRequestError();
        }
        if (!this.merge(record)) return undefined;
        this.touch(id);
        return this.state.items[id].record;
      }
      if (!item.record && !this.operations.has(id)) {
        this.touch(id);
        this.update(id, { issue: 'unknown', canResubmit: true, code: undefined });
      }
      return null;
    } catch (error) {
      if (this.current(epoch) && revision === this.writes.get(id) && !this.missing(error)) this.update(id, { code: 'READ_FAILED' });
      return undefined;
    } finally {
      this.controllers.delete(controller);
      if (this.current(epoch)) this.update(id, { checking: false });
    }
  };

  recover = async (id: string, hasKnowledgeBase: boolean) => {
    const item = this.state.items[id];
    if (!this.active || this.state.unavailable || !item || this.operations.has(id) || item.checking || item.issue === 'conflict') return;
    const epoch = this.epoch;
    // Recovery is user initiated. A GET never starts an execution by itself.
    const record = await this.readItem(id);
    if (!this.current(epoch) || record === undefined || this.operations.has(id)) return;
    const current = this.state.items[id];
    if (!record) {
      if (!item.record && (item.issue === 'unsaved' || item.canResubmit)) {
        await this.perform(id, current.submission, hasKnowledgeBase);
      }
      return;
    }
    if (record.status === 'completed' || record.status === 'processing' && !record.executionExpired) return;
    const request: ChatRequest = record.status === 'pending' ? current.submission
      : { action: 'retry', stageId: this.stageId, sessionId: this.sessionId, sceneId: record.sceneId,
        turnId: record.id, expectedExecutionId: record.executionId! };
    await this.perform(id, request, hasKnowledgeBase);
  };
}
