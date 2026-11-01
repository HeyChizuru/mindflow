/**
 * Simplified prompt system type definitions
 */

/**
 * Prompt template identifier
 */
export type PromptId =
  | 'chat-router'
  | 'chat-teacher'
  | 'chat-memory'
  | 'chat-context-filter'
  | 'requirements-to-outlines'
  | 'slide-content'
  | 'quiz-content'
  | 'slide-actions'
  | 'quiz-actions';

/**
 * Snippet identifier
 */
export type SnippetId = 'json-output-rules';

/**
 * Loaded prompt template
 */
export interface LoadedPrompt {
  id: PromptId;
  systemPrompt: string;
  userPromptTemplate: string;
}
