/**
 * 生成流水线的提示词与上下文构建工具 / Prompt and context building utilities for the generation pipeline.
 */

import type { PdfImage } from '@/lib/types/generation';
import type { AgentInfo, SceneGenerationContext } from './pipeline-types';

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
    const lastSpeech = ctx.previousSpeeches[ctx.previousSpeeches.length - 1];
    lines.push(`  "...${lastSpeech.slice(-150)}"`);
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
 * 格式化单张 PdfImage 描述，用于写入提示词。
 * 在可用时包含尺寸/宽高比信息。
 * / Format a single PdfImage description for prompt inclusion.
 * Includes dimension/aspect-ratio info when available.
 */
export function formatImageDescription(img: PdfImage): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | size: ${img.width}×${img.height} (aspect ratio ${ratio})`;
  }
  const desc = img.description ? ` | ${img.description}` : '';
  return `- **${img.id}**: from PDF page ${img.pageNumber}${dimInfo}${desc}`;
}

/**
 * 格式化视觉模式下的简短图片占位符。
 * 仅包含 ID、页码、尺寸与宽高比（不含描述），因为模型可直接看到图片。
 * / Format a short image placeholder for vision mode.
 * Only ID + page + dimensions + aspect ratio (no description), since the model can see the actual image.
 */
export function formatImagePlaceholder(img: PdfImage): string {
  let dimInfo = '';
  if (img.width && img.height) {
    const ratio = (img.width / img.height).toFixed(2);
    dimInfo = ` | size: ${img.width}×${img.height} (aspect ratio ${ratio})`;
  }
  return `- **${img.id}**: image from PDF page ${img.pageNumber}${dimInfo} [see attached]`;
}

/**
 * 为 AI SDK 构建多模态用户内容数组。
 * 交错排列文本与图片，使模型能将 img_id 与实际图片关联。
 * 每张图片标签在可用时包含尺寸，便于模型在查看图片前了解大小（对布局决策很重要）。
 * / Build a multimodal user content array for the AI SDK.
 * Interleaves text and images so the model can associate img_id with actual image.
 * Each image label includes dimensions when available so the model knows the size
 * before seeing the image (important for layout decisions).
 */
export function buildVisionUserContent(
  userPrompt: string,
  images: Array<{ id: string; src: string; width?: number; height?: number }>,
): Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }> {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
  > = [{ type: 'text', text: userPrompt }];
  if (images.length > 0) {
    parts.push({ type: 'text', text: '\n\n--- Attached Images ---' });
    for (const img of images) {
      let dimInfo = '';
      if (img.width && img.height) {
        const ratio = (img.width / img.height).toFixed(2);
        dimInfo = ` (${img.width}×${img.height}, aspect ratio ${ratio})`;
      }
      parts.push({ type: 'text', text: `\n**${img.id}**${dimInfo}:` });
      // 剥离 data URI 前缀 — AI SDK 仅接受 http(s) URL 或原始 base64 / Strip data URI prefix — AI SDK only accepts http(s) URLs or raw base64
      const dataUriMatch = img.src.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        parts.push({
          type: 'image',
          image: dataUriMatch[2],
          mimeType: dataUriMatch[1],
        });
      } else {
        parts.push({ type: 'image', image: img.src });
      }
    }
  }
  return parts;
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
