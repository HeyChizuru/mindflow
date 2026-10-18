/**
 * Stage 1: Generate scene outlines from user requirements.
 */

import { nanoid } from 'nanoid';
import type { SceneOutline } from '@/lib/types/outline';
import type { UserRequirements } from './pipeline-types';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { parseJsonResponse } from './json-repair';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/**
 * Used when the outline stage fails to produce an explicit directive (LLM
 * schema regression, empty response, upstream error). Downstream prompts
 * still need *something* that steers the model toward the requirement's
 * language rather than defaulting to the training-distribution prior.
 */
export const DEFAULT_LANGUAGE_DIRECTIVE =
  'Teach in the language that matches the user requirement.';

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    researchContext?: string;
    teacherContext?: string;
  },
): Promise<GenerationResult<{ languageDirective: string; outlines: SceneOutline[] }>> {

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';


  // Use simplified prompt variables
  const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
    // New simplified variables
    requirement: requirements.requirement,
    userProfile: userProfileText,
    researchContext: options?.researchContext || 'None',
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user);
    const parsed = parseJsonResponse<
      { languageDirective: string; outlines: SceneOutline[] } | SceneOutline[]
    >(response);

    let languageDirective: string;
    let rawOutlines: SceneOutline[];

    if (Array.isArray(parsed)) {
      // Fallback: LLM returned old flat array format
      languageDirective = DEFAULT_LANGUAGE_DIRECTIVE;
      rawOutlines = parsed;
    } else if (parsed && parsed.outlines) {
      languageDirective = parsed.languageDirective || DEFAULT_LANGUAGE_DIRECTIVE;
      rawOutlines = parsed.outlines;
    } else {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    if (!Array.isArray(rawOutlines)) {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    // Ensure IDs and order
    const enriched = rawOutlines.map((outline, index) => ({
      ...outline,
      id: outline.id || nanoid(),
      order: index + 1,
    }));

    const result = enriched;

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: { languageDirective, outlines: result } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
