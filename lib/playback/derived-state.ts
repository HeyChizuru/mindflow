import type { EngineMode } from './types';

export interface PlaybackRawState {
  engineMode: EngineMode;
  lectureSpeech: string | null;
  playbackCompleted: boolean;
  idleText: string | null;
}

export type PlaybackPhase =
  | 'idle'
  | 'lecturePlaying'
  | 'lecturePaused'
  | 'completed';

export type BubbleButtonState = 'bars' | 'play' | 'restart';

export interface PlaybackView {
  phase: PlaybackPhase;
  sourceText: string;
  buttonState: BubbleButtonState;
}

/** Derive the lecture view without live chat state. */
export function computePlaybackView(raw: PlaybackRawState): PlaybackView {
  let phase: PlaybackPhase;
  if (raw.playbackCompleted) phase = 'completed';
  else if (raw.engineMode === 'playing') phase = 'lecturePlaying';
  else if (raw.engineMode === 'paused') phase = 'lecturePaused';
  else phase = 'idle';

  const buttonState: BubbleButtonState =
    phase === 'completed' ? 'restart'
      : phase === 'lecturePlaying' ? 'bars' : 'play';

  return {
    phase,
    sourceText: raw.lectureSpeech || (phase === 'completed' ? '' : raw.idleText || ''),
    buttonState,
  };
}
