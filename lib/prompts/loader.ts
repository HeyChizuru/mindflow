/**
 * Prompt Loader — 从 Markdown 文件加载提示词 / Loads prompts from markdown files
 *
 * 支持 / Supports:
 * - 从 `templates/{promptId}/` 目录加载 / Loading prompts from `templates/{promptId}/` directory
 * - 通过 `{{snippet:name}}` 语法包含片段 / Snippet inclusion via `{{snippet:name}}` syntax
 * - 通过 `{{#if condition}}...{{/if}}` 语法条件块 / Conditional blocks via `{{#if condition}}...{{/if}}` syntax
 * - 通过 `{{variable}}` 语法变量插值 / Variable interpolation via `{{variable}}` syntax
 */

import fs from 'fs';
import path from 'path';
import type { PromptId, LoadedPrompt, SnippetId } from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('PromptLoader');

/**
 * 获取 prompts 目录路径 / Get the prompts directory path
 */
function getPromptsDir(): string {
  // Next.js 中使用 process.cwd() 作为项目根 / In Next.js, use process.cwd() for the project root
  return path.join(process.cwd(), 'lib', 'prompts');
}

/**
 * 按 ID 加载片段 / Load a snippet by ID
 */
export function loadSnippet(snippetId: SnippetId): string {
  const snippetPath = path.join(getPromptsDir(), 'snippets', `${snippetId}.md`);

  try {
    return fs.readFileSync(snippetPath, 'utf-8').trim();
  } catch {
    // 配置缺失时应立即失败，避免把未展开的 `{{snippet:foo}}` 送给 LLM
    // Fail loud rather than silently shipping `{{snippet:foo}}` to the LLM.
    // 缺失片段是配置或拼写错误，应在加载时暴露
    // A missing snippet is always a config/typo bug — surface at load time.
    throw new Error(`Snippet not found: ${snippetId}`);
  }
}

/**
 * 处理模板中的片段引用，将 `{{snippet:name}}` 替换为片段内容
 * Process snippet includes in a template. Replaces `{{snippet:name}}` with actual snippet content.
 */
export function processSnippets(template: string): string {
  return template.replace(/\{\{snippet:(\w[\w-]*)\}\}/g, (_, snippetId) => {
    return loadSnippet(snippetId as SnippetId);
  });
}

/**
 * 处理模板中的条件块：条件为真时保留块内内容，否则整段移除
 * Process conditional blocks in a template. Replaces `{{#if conditionName}}...{{/if}}` with the
 * inner content when the named condition is truthy, or removes the entire block when it is falsy.
 *
 * 不支持嵌套，以保持提示模板语言简单、可审查
 * Blocks do not nest — this is intentional to keep the prompt templating language simple and reviewable.
 */
export function processConditionalBlocks(
  template: string,
  conditions: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, conditionName: string, content: string) => {
      return conditions[conditionName] ? content : '';
    },
  );
}

/**
 * 按 ID 加载提示词 / Load a prompt by ID
 */
export function loadPrompt(promptId: PromptId): LoadedPrompt | null {
  // 拼接 templates/{promptId} 完整路径 / Join path segments into the full prompt directory path
  const promptDir = path.join(getPromptsDir(), 'templates', promptId);

  try {
    // Load system.zh-CN.md
    const systemPath = path.join(promptDir, 'system.zh-CN.md');
    let systemPrompt = fs.readFileSync(systemPath, 'utf-8').trim();
    systemPrompt = processSnippets(systemPrompt);

    // Load user.zh-CN.md (optional, may not exist)
    const userPath = path.join(promptDir, 'user.zh-CN.md');
    let userPromptTemplate = '';
    try {
      userPromptTemplate = fs.readFileSync(userPath, 'utf-8').trim();
      userPromptTemplate = processSnippets(userPromptTemplate);
    } catch {
      // user.zh-CN.md is optional
    }

    return {
      id: promptId,
      systemPrompt,
      userPromptTemplate,
    };
  } catch (error) {
    log.error(`Failed to load prompt ${promptId}:`, error);
    return null;
  }
}

/**
 * 在模板中插值变量，用 `variables` 中的值替换 `{{variable}}`
 * Interpolate variables in a template. Replaces `{{variable}}` with values from the variables object.
 */
export function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  // `\w+` 只匹配 [A-Za-z0-9_]，因此 kebab-case 占位符如 `{{next-agent}}` 会原样保留
  // `\w+` only matches [A-Za-z0-9_], so kebab-case placeholders like `{{next-agent}}` pass through unchanged.
  // 约定（见 README）为 camelCase；tests/prompts/templates.test.ts 会扫描不合规占位符
  // Convention (per README) is camelCase; tests in tests/prompts/templates.test.ts scan templates for non-conforming placeholders.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/**
 * 用变量构建完整提示词 / Build a complete prompt with variables.
 *
 * 处理顺序 / Processing order:
 *   1. 片段包含（`{{snippet:name}}`）—  splice 文件内容 / Snippet includes — file content spliced in
 *   2. 条件块（`{{#if flag}}...{{/if}}`）— 由 `variables` 控制 / Conditional blocks — gated on `variables`
 *   3. 变量插值（`{{varName}}`）— 替换值 / Variable interpolation — values substituted
 */
export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const prompt = loadPrompt(promptId);
  if (!prompt) return null;

  return {
    system: interpolateVariables(
      processConditionalBlocks(prompt.systemPrompt, variables),
      variables,
    ),
    user: interpolateVariables(
      processConditionalBlocks(prompt.userPromptTemplate, variables),
      variables,
    ),
  };
}
