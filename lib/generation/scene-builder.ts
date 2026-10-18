/**
 * Standalone scene building and element normalization.
 * Does NOT depend on store — returns validated scene creation inputs.
 */

import type { SceneOutline } from '@/lib/types/outline';
import type { CreateSceneInput } from '@/lib/types/scene';
import { buildCompleteScene } from './scene-assembly';
export { buildCompleteScene } from './scene-assembly';
import { generateSceneContent, generateSceneActions } from './scene-generator';
import type { AgentInfo, SceneGenerationContext, AICallFn } from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/**
 * Build a scene creation input from an outline, keeping both phase callbacks.
 * Persistence and database-generated fields are the caller's responsibility.
 */
export async function buildSceneFromOutline(
  outline: SceneOutline,
  aiCall: AICallFn,
  stageId: string,
  ctx?: SceneGenerationContext,
  agents?: AgentInfo[],
  onPhaseChange?: (phase: 'content' | 'actions') => void,
  userProfile?: string,
  languageDirective?: string,
): Promise<CreateSceneInput | null> {

  const langText = languageDirective;

  // Step 1: Generate content
  onPhaseChange?.('content');
  log.info(`Step 1: Generating content for: ${outline.title}`);
  const content = await generateSceneContent(outline, aiCall, {
    agents,
    languageDirective: langText,
  });
  if (!content) {
    log.error(`Failed to generate content for: ${outline.title}`);
    return null;
  }

  // Step 2: Generate Actions
  onPhaseChange?.('actions');
  log.info(`Step 2: Generating actions for: ${outline.title}`);
  const actions = await generateSceneActions(outline, content, aiCall, {
    ctx,
    agents,
    userProfile,
    languageDirective: langText,
  });
  log.info(`Generated ${actions.length} actions for: ${outline.title}`);

  // Build complete Scene object
  return buildCompleteScene(outline, content, actions, stageId);
}
