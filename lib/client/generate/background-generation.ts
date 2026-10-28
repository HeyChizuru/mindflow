import type { ReadyClassroom } from '@/lib/client/classroom';
import type { BackgroundGenerationState, BackgroundGenerationStep, SceneContentGenerationBody } from '@/lib/types/stage-generation';
import { formatUserProfile } from '@/lib/generation/prompt-formatters';
import { generateSceneContent, generateSceneActions, StageGenerationRequestError } from './stage-generation';

export const initialBackgroundGenerationState = (): BackgroundGenerationState => ({
  phase: 'idle', target: null, failedStep: null, reason: null, error: null, recovery: null,
});

type Dependencies = {
  current: () => ReadyClassroom | null;
  read: () => Promise<ReadyClassroom | null>;
  headers: (hasKnowledgeBase: boolean) => HeadersInit;
  onState: (state: BackgroundGenerationState) => void;
  content?: typeof generateSceneContent;
  actions?: typeof generateSceneActions;
};
type Run = { id: number; controller: AbortController };

/** A single page's serial loop; classroom snapshots and saved results belong to the caller. */
export class BackgroundGeneration {
  private active = false;
  private sequence = 0;
  private run: Run | null = null;
  private state = initialBackgroundGenerationState();
  constructor(private readonly dependencies: Dependencies) {}

  start() {
    if (this.active) return;
    this.active = true;
    this.update(initialBackgroundGenerationState());
  }

  dispose() {
    this.active = false;
    this.cancel();
  }

  observe(data: ReadyClassroom | null) {
    if (!this.active) return;
    if (!data) {
      this.cancel();
      this.update(initialBackgroundGenerationState());
    } else if (data.allScenesReady) {
      this.cancel();
      this.update({ ...initialBackgroundGenerationState(), phase: 'complete' });
    } else if (!this.run && this.state.phase === 'idle') {
      void this.generate(data);
    }
  }

  retry = async () => {
    if (!this.active || this.run || this.state.phase !== 'failed') return;
    await this.generate(null);
  };

  private cancel() {
    this.sequence++;
    this.run?.controller.abort();
    this.run = null;
  }

  private current(run: Run) {
    return this.active && this.run === run && run.id === this.sequence && !run.controller.signal.aborted;
  }

  private update(state: BackgroundGenerationState) {
    if (!this.active) return;
    this.state = state;
    this.dependencies.onState(state);
  }

  private progress(phase: BackgroundGenerationStep, target = this.state.target) {
    this.update({ ...initialBackgroundGenerationState(), phase, target });
  }

  private fail(step: BackgroundGenerationStep, reason: BackgroundGenerationState['reason'], recovery: 'read' | 'retry', error: string | null = null) {
    this.update({ ...this.state, phase: 'failed', failedStep: step, reason, recovery, error });
  }

  private async read(run: Run): Promise<ReadyClassroom | null> {
    this.progress('reading');
    let data: ReadyClassroom | null;
    try { data = await this.dependencies.read(); } catch { data = null; }
    if (!this.current(run)) return null;
    if (!data) this.fail('reading', 'read_failed', 'read');
    return data;
  }

  private async generate(initial: ReadyClassroom | null) {
    const run = { id: ++this.sequence, controller: new AbortController() };
    this.run = run;
    try {
      let data = initial ?? await this.read(run);
      while (this.current(run) && data) {
        if (data.allScenesReady) {
          this.update({ ...initialBackgroundGenerationState(), phase: 'complete' });
          return;
        }
        const index = data.directory.findIndex(entry => !entry.ready);
        const outline = data.outlines[index];
        const previous = data.scenes.find(scene => scene.outlineId === data?.outlines[index - 1]?.id);
        const previousSpeeches = previous?.actions.flatMap(action => action.type === 'speech' ? [action.text] : []) ?? [];
        if (!outline || index <= 0 || previousSpeeches.length === 0) {
          this.update({ ...this.state, target: outline ? { outlineId: outline.id, title: outline.title } : null });
          this.fail('reading', 'previous_scene_missing', 'read');
          return;
        }
        const target = { outlineId: outline.id, title: outline.title };
        const input: SceneContentGenerationBody = {
          stageId: data.stage.id, outline, allOutlines: data.outlines,
          requirement: data.stage.requirements.requirement, languageDirective: data.languageDirective,
          userProfile: formatUserProfile(data.stage.requirements),
        };
        let step: BackgroundGenerationStep = 'content';
        try {
          const headers = new Headers(this.dependencies.headers(data.stage.hasKnowledgeBase));
          const chatHeaders = new Headers(headers);
          for (const key of [...chatHeaders.keys()]) {
            if (key.startsWith('x-mindflow-llm-embedding-')) chatHeaders.delete(key);
          }
          this.progress(step, target);
          const content = await (this.dependencies.content ?? generateSceneContent)(input, headers, run.controller.signal);
          if (!this.current(run)) return;
          const latest = this.dependencies.current();
          if (latest?.directory.some(entry => entry.outlineId === outline.id && entry.ready)) {
            data = latest;
            continue;
          }
          step = 'actions';
          this.progress(step, target);
          await (this.dependencies.actions ?? generateSceneActions)({ ...input, content: content.content, previousSpeeches }, chatHeaders, run.controller.signal);
          if (!this.current(run)) return;
        } catch (error) {
          if (!this.current(run)) return;
          const recovered = await this.read(run);
          if (!this.current(run) || !recovered) return;
          if (recovered.directory.some(entry => entry.outlineId === outline.id && entry.ready)) {
            data = recovered;
            continue;
          }
          this.fail(step, 'generation_failed', 'retry', error instanceof StageGenerationRequestError ? error.message : null);
          return;
        }
        data = await this.read(run);
        if (!this.current(run) || !data) return;
        if (!data.directory.some(entry => entry.outlineId === outline.id && entry.ready)) {
          this.fail('reading', 'saved_scene_unavailable', 'read');
          return;
        }
      }
    } finally {
      if (this.run === run) this.run = null;
    }
  }
}
