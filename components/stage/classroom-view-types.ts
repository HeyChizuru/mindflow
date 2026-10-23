import type { Action } from '@/lib/types/action';
import type { ClassroomDirectoryEntry, QuizAnswer, QuizSubmission } from '@/lib/types/classroom';
import type { Scene } from '@/lib/types/scene';

export type PageState = 'ready' | 'loading' | 'draft' | 'first_scene_pending' | 'not_found' | 'invalid_address' | 'read_failed';
export type PlaybackDisplay = 'idle' | 'playing' | 'paused' | 'discussion' | 'ended';
export type TeachingEffect = Exclude<Action, { type: 'speech' | 'discussion' }>;
export type QuestionDisplay = {
  record?: QuizSubmission;
  draft?: QuizAnswer;
  editing?: boolean;
  submitting?: boolean;
  issue?: 'unsaved' | 'unknown' | 'conflict';
};
export type QuizPresentation = {
  questions?: Record<string, QuestionDisplay>;
  onChange?: (questionId: string, answer: QuizAnswer) => void;
  onSubmit?: (questionId: string) => void;
  onRedo?: (questionId: string) => void;
  onCancel?: (questionId: string) => void;
  onRetry?: (questionId: string) => void;
  onRead?: (questionId: string) => void;
  onSkip?: () => void;
};
export type ClassroomNotice = { title: string; message: string; actionLabel?: string; onAction?: () => void };
export interface ClassroomViewProps {
  directory: ClassroomDirectoryEntry[];
  scene: Scene | null;
  pageState?: PageState;
  generationUrl?: string;
  playback: PlaybackDisplay;
  subtitle?: string | null;
  discussion?: { topic: string; prompt?: string } | null;
  effects?: TeachingEffect[];
  quiz?: QuizPresentation;
  notice?: ClassroomNotice | null;
  allScenesReady?: boolean;
  ungraded?: { sceneId: string; questionId: string; label: string }[];
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSceneSelect: (sceneId: string | null, outlineId: string) => void;
  onPlayPause?: () => void;
  onNextSegment?: () => void;
  onReplay?: () => void;
  onContinue?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onRead?: () => void;
  onLocateQuestion?: (sceneId: string, questionId: string) => void;
  isPresenting?: boolean;
  onFullscreen?: () => void;
}
