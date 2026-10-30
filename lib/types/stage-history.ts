import type { SlideCanvas } from '@/lib/types/scene';

export type HistoryPhase = 'draft' | 'first_scene_pending' | 'partial' | 'ready' | 'invalid';
export type HistoryPreview = { type: 'slide'; canvas: SlideCanvas } | { type: 'quiz'; title: string } | null;
export type StageHistoryItem = {
  id: string;
  name: string;
  createdAt: string;
  phase: HistoryPhase;
  totalPages: number | null;
  readyPages: number;
  preview: HistoryPreview;
};
export type StageHistoryPage = {
  items: StageHistoryItem[];
  total: number;
  matched: number;
  nextCursor: string | null;
};
export type StageDeletionResult = { id: string; recordDeleted: true; filesDeleted: boolean };
