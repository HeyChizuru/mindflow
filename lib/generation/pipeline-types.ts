/**
 * Type definitions for the generation pipeline.
 */

import type { JsonObject } from '@/lib/types/action';
import type { SceneOutline } from '@/lib/types/outline';
import type { CreateSceneInput } from '@/lib/types/scene';

/** Kept for reusable batch orchestration; these sessions are not persisted. */
export interface UserRequirements {
  requirement: string;
  userNickname?: string;
  userBio?: string;
}

export interface GenerationProgress {
  currentStage: 1 | 2 | 3;
  overallProgress: number;
  stageProgress: number;
  statusMessage: string;
  scenesGenerated: number;
  totalScenes: number;
  errors?: string[];
}

export interface GenerationSession {
  id: string;
  requirements: UserRequirements;
  progress: GenerationProgress;
  sceneOutlines?: SceneOutline[];
  startedAt: Date;
  completedAt?: Date;
}

/** Storage is supplied by the caller, without importing a browser Store. */
export interface StageStore {
  stageId: string;
  scene: {
    create(input: CreateSceneInput): GenerationResult<string> | Promise<GenerationResult<string>>;
  };
}

export interface TeacherAction {
  type: 'speech' | 'highlight' | 'setState' | 'annotation';
  label?: string;
  target?: string;
  content?: string;
  state?: JsonObject;
}

// ==================== Agent Info ====================

/** Lightweight agent info passed to the generation pipeline */
export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  persona?: string;
}

// ==================== Cross-Page Context ====================

/** Cross-page context for maintaining speech coherence across scenes */
export interface SceneGenerationContext {
  pageIndex: number; // Current page (1-based)
  totalPages: number; // Total number of pages
  allTitles: string[]; // All page titles in order
  previousSpeeches: string[]; // Speech texts from the previous page only
}

// ==================== Generated Slide Data Interface ====================

/**
 * AI-generated slide data structure
 * Used to parse AI responses
 */
export interface GeneratedSlideData {
  elements: Array<{
    type: 'text' | 'image' | 'video' | 'shape' | 'chart' | 'latex' | 'line';
    left: number;
    top: number;
    width: number;
    height: number;
    [key: string]: unknown;
  }>;
  background?: {
    type: 'solid' | 'gradient';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      colors: Array<{ pos: number; color: string }>;
      rotate: number;
    };
  };
  remark?: string;
}

// ==================== Types ====================

export interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GenerationCallbacks {
  onProgress?: (progress: GenerationProgress) => void;
  onStageComplete?: (stage: 1 | 2 | 3, result: unknown) => void;
  onError?: (error: string) => void;
}

export type AICallFn = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string>;
