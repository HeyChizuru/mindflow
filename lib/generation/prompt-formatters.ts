/**
 * 生成流水线的提示词与上下文构建工具 / Prompt and context building utilities for the generation pipeline.
 */

import type { AgentInfo, SceneGenerationContext } from './pipeline-types';
import type { StageRequirements } from '@/lib/types/stage';

/** Shared by request preparation and saved-input validation; absent fields stay absent. */
export function formatUserProfile(input: Pick<StageRequirements, 'userNickname' | 'userBio'>): string | undefined {
  const nickname = input.userNickname?.trim();
  const bio = input.userBio?.trim();
  const text = [nickname ? `Nickname: ${nickname}` : '', bio ? `Background: ${bio}` : '']
    .filter(Boolean).join('\n');
  return text || undefined;
}

/** Common input context without requiring changes to unrelated prompt files. */
export function buildGenerationInputContext(input: {
  requirement?: string;
  userProfile?: string;
  ctx?: SceneGenerationContext;
  retrievalExcerpts?: string;
}): string {
  return [
    input.requirement ? `Course requirement:\n${input.requirement}` : '',
    input.userProfile ? `Learner information:\n${input.userProfile}` : '',
    input.ctx ? buildCourseContext(input.ctx) : '',
    input.retrievalExcerpts
      ? `Reference excerpts (use only supplied facts; do not invent citations):\n${input.retrievalExcerpts}`
      : '',
  ].filter(Boolean).join('\n\n');
}

/** 构建课程上下文字符串，用于注入到 action 提示词中 / Build a course context string for injection into action prompts */
export function buildCourseContext(ctx?: SceneGenerationContext): string {
  if (!ctx) return '';

  const lines: string[] = [];

  // 课程大纲及当前页位置标记 / Course outline with position marker
  lines.push('Course Outline:');
  ctx.allTitles.forEach((t, i) => {
    const marker = i === ctx.pageIndex - 1 ? ' ← current' : '';
    lines.push(`  ${i + 1}. ${t}${marker}`);
  });

  // 位置信息 / Position information
  lines.push('');
  lines.push(
    'IMPORTANT: All pages belong to the SAME class session. Do NOT greet again after the first page. When referencing content from earlier pages, say "we just covered" or "as mentioned on page N" — NEVER say "last class" or "previous session" because there is no previous session.',
  );
  lines.push('');
  if (ctx.pageIndex === 1) {
    lines.push('Position: This is the FIRST page. Open with a greeting and course introduction.');
  } else if (ctx.pageIndex === ctx.totalPages) {
    lines.push('Position: This is the LAST page. Conclude the course with a summary and closing.');
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  } else {
    lines.push(`Position: Page ${ctx.pageIndex} of ${ctx.totalPages} (middle of the course).`);
    lines.push(
      'Transition: Continue naturally from the previous page. Do NOT greet or re-introduce.',
    );
  }

  // 上一页讲稿，供衔接过渡参考 / Previous page speech for transition reference
  if (ctx.previousSpeeches.length > 0) {
    lines.push('');
    lines.push('Previous page speech (for transition reference):');
    ctx.previousSpeeches.forEach((speech, index) => {
      lines.push(`  ${index + 1}. ${speech}`);
    });
  }

  return lines.join('\n');
}

/** 格式化 Agent 列表，用于注入到 action 提示词中 / Format agent list for injection into action prompts */
export function formatAgentsForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const lines = ['Classroom Agents:'];
  for (const a of agents) {
    const personaPart = a.persona ? ` — ${a.persona}` : '';
    lines.push(`- id: "${a.id}", name: "${a.name}", role: ${a.role}${personaPart}`);
  }
  return lines.join('\n');
}

/** 提取教师 Agent 的人设，用于注入到大纲/内容提示词中 / Extract the teacher agent's persona for injection into outline/content prompts */
export function formatTeacherPersonaForPrompt(agents?: AgentInfo[]): string {
  if (!agents || agents.length === 0) return '';

  const teacher = agents.find((a) => a.role === 'teacher');
  if (!teacher?.persona) return '';

  return `Teacher Persona:\nName: ${teacher.name}\n${teacher.persona}\n\nAdapt the content style and tone to match this teacher's personality. IMPORTANT: The teacher's name and identity must NOT appear on the slides — no "Teacher ${teacher.name}'s tips", no "Teacher's message", etc. Slides should read as neutral, professional visual aids.`;
}

/**
 * 根据课程级语言指令与可选的场景备注构建语言说明文本。
 * 供场景内容与 action 生成器注入到提示词模板中。
 * / Build language instruction text from course-level directive and optional per-scene note.
 * Used by scene content and action generators to inject into prompt templates.
 */
export function buildLanguageText(directive?: string, sceneNote?: string): string {
  if (!directive && !sceneNote) return '';
  let text = directive || '';
  if (sceneNote) {
    text += (text ? '\n\n' : '') + `Additional language note for this scene: ${sceneNote}`;
  }
  return text;
}
