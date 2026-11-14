import { classroomIdSchema, quizAnswerSchema } from '@/lib/validators/classroom';
import type { ClassroomReadResponse, QuizAnswer, QuizGradeBody } from '@/lib/types/classroom';
import type { QuestionDisplay } from '@/components/stage/classroom-view-types';
import { ClassroomRequestError, readClassroom, writePlaybackPosition, sendQuizAnswer, type ReadyClassroom } from './classroom';
import { BackgroundGeneration, initialBackgroundGenerationState } from './generate/background-generation';
import type { BackgroundGenerationState } from '@/lib/types/stage-generation';

export type SessionNotice = { title: string; message: string; action?: 'read' | 'position'; kind?: 'read_failed' };
export type ClassroomSessionState = {
  page: 'loading' | 'draft' | 'first_scene_pending' | 'ready' | 'not_found' | 'invalid_address' | 'read_failed';
  classroom: ReadyClassroom | null;
  generationUrl?: string;
  sceneId: string | null;
  playbackRun: number;
  questions: Record<string, QuestionDisplay>;
  notice: SessionNotice | null;
  positionNotice: SessionNotice | null;
  generation: BackgroundGenerationState;
};
const questionKey = (stageId: string, sceneId: string, questionId: string) => stageId + '/' + sceneId + '/' + questionId;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One page's orchestration; PostgreSQL responses remain authoritative. No browser persistence. */
export class ClassroomSession {
  readonly stageId: string;
  private state: ClassroomSessionState;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private active = false;
  private readSequence = 0;
  private revision = 0;
  private writes = new Map<string, number>();
  private controllers = new Set<AbortController>();
  private operations = new Map<string, QuizGradeBody>();
  private pending = new Map<string, QuizGradeBody>();
  private positionRunning = false;
  private desiredPosition: string | null = null;
  private latestRead: Promise<ClassroomReadResponse | null> | null = null;
  private readonly generation: BackgroundGeneration;
  private getModelHeaders: (hasKnowledgeBase: boolean) => HeadersInit;
  constructor(stageId: string, getModelHeaders: (hasKnowledgeBase: boolean) => HeadersInit) {
    this.stageId = stageId.toLowerCase();
    this.getModelHeaders = getModelHeaders;
    this.state = { page: classroomIdSchema.safeParse(stageId).success ? 'loading' : 'invalid_address',
      classroom: null, sceneId: null, playbackRun: 0, questions: {}, notice: null, positionNotice: null,
      generation: initialBackgroundGenerationState() };
    this.generation = new BackgroundGeneration({
      current: () => this.state.classroom,
      read: async () => {
        const response = await this.refresh();
        return response?.state === 'ready' ? this.state.classroom : null;
      },
      headers: (hasKnowledgeBase) => this.getModelHeaders(hasKnowledgeBase),
      onState: (generation) => this.patch({ generation }),
    });
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private patch(patch: Partial<ClassroomSessionState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private controller() { const controller = new AbortController(); this.controllers.add(controller); return controller; }
  start = () => {
    if (this.active) return;
    this.active = true; this.epoch++;
    this.generation.start();
    if (this.state.page !== 'invalid_address') void this.refresh();
  };
  dispose = () => {
    this.active = false; this.epoch++;
    this.generation.dispose(); this.latestRead = null;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear(); this.operations.clear();
    this.positionRunning = false; this.desiredPosition = null;
  };
  key = (sceneId: string, questionId: string) => questionKey(this.stageId, sceneId, questionId);
  private display(sceneId: string, questionId: string) { return this.state.questions[this.key(sceneId, questionId)] ?? {}; }
  private updateQuestion(sceneId: string, questionId: string, patch: QuestionDisplay) {
    const key = this.key(sceneId, questionId);
    this.patch({ questions: { ...this.state.questions, [key]: { ...this.display(sceneId, questionId), ...patch } } });
  }
  private touch(key: string) { this.writes.set(key, ++this.revision); }
  // 合并最新服务端快照时，保留读取开始后发生的本地写入和当前播放场景。
  private mergeReady(data: ReadyClassroom, readRevision: number) {
    const previous = this.state.classroom;
    const scenes = data.scenes.map((scene) => {
      const existing = previous?.scenes.find((item) => item.id === scene.id);
      return existing && same(existing, scene) ? existing : scene;
    });
    const questions = { ...this.state.questions };
    for (const record of data.answers) {
      const key = this.key(record.sceneId, record.questionId);
      // 旧读请求不能覆盖发起读取后已经更新的题目状态。
      if ((this.writes.get(key) ?? 0) > readRevision) continue;
      const current = questions[key] ?? {};
      const stored = current.record;
      if (stored && (stored.version > record.version || stored.version === record.version && stored.updatedAt > record.updatedAt)) continue;
      if (stored && stored.version === record.version && stored.executionId === record.executionId &&
        stored.status === 'completed' && record.status !== 'completed') continue;
      const pending = this.pending.get(key);
      const ownsSubmission = pending?.operation === 'submit' && pending.requestId === record.submissionId;
      const changed = stored?.submissionId !== record.submissionId;
      const dirty = !!current.draft || current.editing;
      questions[key] = ownsSubmission
        ? { record, submitting: false }
        : { ...current, record, ...(changed && dirty ? { issue: 'conflict' as const } : {}) };
    }
    const sceneId = previous && scenes.some((scene) => scene.id === this.state.sceneId)
      ? this.state.sceneId
      : data.playback.sceneId;
    this.patch({ page: 'ready', classroom: { ...data, scenes }, sceneId, questions,
      ...(this.state.notice?.kind === 'read_failed' ? { notice: null } : {}),
      ...((!previous && data.playback.fallbackReason || previous && sceneId !== this.state.sceneId) ? { notice: { title: '已回到首场', message: '上次保存的位置已不可用，从首场开头观看。' } } : {}) });
  }
  retryGeneration = () => this.generation.retry();
  refresh = (): Promise<ClassroomReadResponse | null> => {
    if (!this.active) return Promise.resolve(null);
    const operation = this.readSnapshot(this.epoch, ++this.readSequence, this.revision);
    this.latestRead = operation;
    return operation;
  };
  private async readSnapshot(epoch: number, sequence: number, revision: number): Promise<ClassroomReadResponse | null> {
    const controller = this.controller();
    try {
      const data = await readClassroom(this.stageId, controller.signal);
      if (!this.active || epoch !== this.epoch) return null;
      if (sequence !== this.readSequence) return this.latestRead;
      if (data.state === 'ready') this.mergeReady(data.classroom, revision);
      else this.patch({ page: data.state, classroom: null, sceneId: null, generationUrl: data.generationUrl });
      this.generation.observe(data.state === 'ready' ? this.state.classroom : null);
      return data;
    } catch (error) {
      if (!this.active || epoch !== this.epoch || controller.signal.aborted) return null;
      if (sequence !== this.readSequence) return this.latestRead;
      if (error instanceof ClassroomRequestError && error.status === 404) {
        this.patch({ page: 'not_found', classroom: null, sceneId: null });
        this.generation.observe(null);
      }
      else if (this.state.classroom) this.patch({ notice: { title: '课堂更新失败', message: '当前内容和输入仍保留，可以重新读取。', action: 'read', kind: 'read_failed' } });
      else this.patch({ page: error instanceof ClassroomRequestError && error.status === 404 ? 'not_found' : 'read_failed' });
      return null;
    } finally { this.controllers.delete(controller); }
  }
  selectScene = (sceneId: string | null) => {
    const data = this.state.classroom;
    if (!data || !sceneId || !data.directory.some((item) => item.ready && item.sceneId === sceneId) || !data.scenes.some((scene) => scene.id === sceneId)) {
      this.patch({ notice: { title: '目标场景尚未就绪', message: '当前画面和输入保持不变，可重新读取课堂内容。', action: 'read' } });
      return;
    }
    this.patch({ sceneId, playbackRun: this.state.playbackRun + 1, notice: null });
    this.desiredPosition = sceneId;
    void this.flushPosition();
  };
  replay = () => this.patch({ playbackRun: this.state.playbackRun + 1 });
  private async flushPosition() {
    if (this.positionRunning) return;
    this.positionRunning = true;
    const epoch = this.epoch;
    try {
      while (this.active && epoch === this.epoch && this.desiredPosition) {
        const sceneId = this.desiredPosition;
        this.desiredPosition = null;
        const controller = this.controller();
        this.patch({ positionNotice: { title: '正在保存观看位置', message: '当前内容仍可观看。' } });
        try {
          await writePlaybackPosition(this.stageId, sceneId, controller.signal);
          if (!this.active || epoch !== this.epoch) return;
          if (!this.desiredPosition) this.patch({ positionNotice: null });
        } catch {
          if (!this.active || epoch !== this.epoch || controller.signal.aborted) return;
          if (!this.desiredPosition) this.patch({ positionNotice: { title: '观看位置未确认保存', message: '当前内容仍可观看，请先读取确认后重试保存。', action: 'position' } });
        } finally { this.controllers.delete(controller); }
      }
    } finally { if (epoch === this.epoch) this.positionRunning = false; }
  }
  retryPosition = async () => {
    const data = await this.refresh();
    if (!data || data.state !== 'ready') return;
    const current = this.state.sceneId;
    if (!current || !data.classroom.scenes.some((scene) => scene.id === current)) return;
    if (data.classroom.playback.savedSceneId === current) this.patch({ positionNotice: null });
    else { this.desiredPosition = current; await this.flushPosition(); }
  };
  changeAnswer = (sceneId: string, questionId: string, draft: QuizAnswer) => {
    const key = this.key(sceneId, questionId), display = this.display(sceneId, questionId);
    if (this.operations.has(key) || display.submitting || display.issue === 'unknown' || display.issue === 'conflict' ||
      display.record?.status === 'processing' && !display.record.executionExpired || display.record && !display.editing) return;
    this.pending.delete(key);
    this.updateQuestion(sceneId, questionId, { draft, issue: undefined });
  };
  redo = (sceneId: string, questionId: string) => {
    const key = this.key(sceneId, questionId), current = this.display(sceneId, questionId);
    if (!current.record || this.operations.has(key) || current.record.status === 'processing' && !current.record.executionExpired || current.issue) return;
    this.pending.delete(key);
    this.updateQuestion(sceneId, questionId, { editing: true, draft: undefined, issue: undefined });
  };
  cancelRedo = (sceneId: string, questionId: string) => {
    const key = this.key(sceneId, questionId);
    if (this.operations.has(key)) return;
    this.pending.delete(key);
    this.updateQuestion(sceneId, questionId, { editing: false, draft: undefined, issue: undefined });
  };
  submit = async (sceneId: string, questionId: string) => {
    const key = this.key(sceneId, questionId), display = this.display(sceneId, questionId);
    const scene = this.state.classroom?.scenes.find((scene) => scene.id === sceneId);
    const question = scene?.content.type === 'quiz' ? scene.content.questions.find((item) => item.id === questionId) : null;
    const parsed = quizAnswerSchema.safeParse(display.draft);
    if (!question || !parsed.success || question.type !== parsed.data.type || this.operations.has(key) ||
      display.issue === 'conflict' || display.issue === 'unknown' || display.record && !display.editing) return;
    if (parsed.data.type !== 'short_answer' && question.type !== 'short_answer') {
      const values = parsed.data.type === 'single' ? [parsed.data.value] : parsed.data.values;
      if (values.some((value) => !question.options.some((option) => option.value === value))) return;
    }
    const prior = this.pending.get(key);
    const expectedVersion = display.record?.version ?? null;
    const body: QuizGradeBody = prior?.operation === 'submit' && prior.expectedVersion === expectedVersion && same(prior.answer, parsed.data)
      ? prior : { operation: 'submit', stageId: this.stageId, sceneId, questionId, requestId: crypto.randomUUID(), expectedVersion, answer: parsed.data };
    await this.perform(body);
  };
  retryGrading = async (sceneId: string, questionId: string) => {
    const key = this.key(sceneId, questionId), display = this.display(sceneId, questionId), record = display.record;
    if (!record || record.answer.type !== 'short_answer' || record.status === 'completed' || display.editing ||
      display.issue || this.operations.has(key) || record.status === 'processing' && !record.executionExpired) return;
    await this.perform({ operation: 'retry', stageId: this.stageId, sceneId, questionId, submissionId: record.submissionId,
      expectedExecutionId: record.executionId, requestId: crypto.randomUUID() });
  };
  private async perform(body: QuizGradeBody) {
    const key = this.key(body.sceneId, body.questionId), epoch = this.epoch;
    this.operations.set(key, body); this.pending.set(key, body); this.touch(key);
    this.updateQuestion(body.sceneId, body.questionId, { submitting: true, issue: undefined });
    const controller = this.controller();
    try {
      const needsModel = body.operation === 'retry' || body.answer.type === 'short_answer';
      const record = await sendQuizAnswer(body, needsModel ? this.getModelHeaders(false) : {}, controller.signal);
      if (!this.active || epoch !== this.epoch) return;
      this.touch(key);
      this.updateQuestion(body.sceneId, body.questionId, { record, draft: undefined, editing: false, submitting: false, issue: undefined });
      this.pending.delete(key);
    } catch (error) {
      if (!this.active || epoch !== this.epoch || controller.signal.aborted) return;
      this.touch(key);
      const payload = error instanceof ClassroomRequestError ? error.payload : null;
      if (payload?.answerSaved === true && payload.record) {
        this.updateQuestion(body.sceneId, body.questionId, { record: payload.record, draft: undefined, editing: false, submitting: false, issue: undefined });
        this.pending.delete(key);
      } else {
        const conflict = payload?.code === 'CONFLICT' || payload?.code === 'GRADING_IN_PROGRESS';
        this.updateQuestion(body.sceneId, body.questionId, {
          ...(payload?.record ? { record: payload.record } : {}), submitting: false,
          issue: conflict ? 'conflict' : payload?.answerSaved === false ? 'unsaved' : 'unknown',
        });
        if (conflict) this.pending.delete(key);
      }
      this.patch({ notice: { title: '测验处理未完成', message: payload?.error ?? '提交结果暂无法确认，请读取当前记录后再操作。' } });
    } finally {
      this.controllers.delete(controller);
      if (epoch === this.epoch) this.operations.delete(key);
    }
  }
  readLatest = async (sceneId: string, questionId: string) => {
    const key = this.key(sceneId, questionId), pending = this.pending.get(key), revision = this.writes.get(key);
    const response = await this.refresh();
    if (!response || response.state !== 'ready') return;
    if (revision !== this.writes.get(key)) return;
    const record = response.classroom.answers.find((item) => item.sceneId === sceneId && item.questionId === questionId);
    if (this.operations.has(key) && (!record || pending?.operation === 'submit' && record.submissionId !== pending.requestId)) return;
    const unsaved = pending?.operation === 'submit' && (!record || record.submissionId !== pending.requestId && record.version === pending.expectedVersion);
    this.touch(key);
    if (unsaved) this.updateQuestion(sceneId, questionId, { record, issue: 'unsaved', submitting: false });
    else {
      this.pending.delete(key);
      this.updateQuestion(sceneId, questionId, { record, issue: undefined, submitting: false, editing: false, draft: undefined });
    }
  };
}
