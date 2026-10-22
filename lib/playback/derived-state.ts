import type { EngineMode, TriggerEvent } from './types';

export interface PlaybackRawState {
  engineMode: EngineMode;
  lectureSpeech: string | null;
  discussionTrigger: TriggerEvent | null;
  playbackCompleted: boolean;
  idleText: string | null;
}

export type PlaybackPhase =
  | 'idle'
  | 'lecturePlaying'
  | 'lecturePaused'
  | 'waitingProactive'
  | 'completed';

export type BubbleButtonState = 'bars' | 'play' | 'restart' | 'none';

export interface PlaybackView {
  phase: PlaybackPhase;
  sourceText: string;
  buttonState: BubbleButtonState;
  isTopicActive: boolean;
}

/** Derive the lecture and discussion-prompt view without live chat state. */
export function computePlaybackView(raw: PlaybackRawState): PlaybackView {
  let phase: PlaybackPhase;
  if (raw.discussionTrigger) phase = 'waitingProactive';
  else if (raw.playbackCompleted) phase = 'completed';
  else if (raw.engineMode === 'playing') phase = 'lecturePlaying';
  else if (raw.engineMode === 'paused') phase = 'lecturePaused';
  else phase = 'idle';

  const buttonState: BubbleButtonState =
    phase === 'waitingProactive' ? 'none'
      : phase === 'completed' ? 'restart'
        : phase === 'lecturePlaying' ? 'bars' : 'play';

  return {
    phase,
    sourceText: raw.lectureSpeech || (phase === 'completed' ? '' : raw.idleText || ''),
    buttonState,
    isTopicActive: !!raw.discussionTrigger,
  };
}
