import katex from 'katex';
import type { Scene, QuizQuestion } from '@/lib/types/scene';
import type { ClassroomDirectoryEntry, QuizSubmission } from '@/lib/types/classroom';
import type { TeachingEffect } from '@/components/stage/classroom-view-types';

export const STAGE_ID = '11111111-1111-4111-8111-111111111111';
export const SLIDE_ID = '22222222-2222-4222-8222-222222222222';
export const QUIZ_ID = '33333333-3333-4333-8333-333333333333';
export const END_ID = '44444444-4444-4444-8444-444444444444';
const time = '2026-10-22T00:00:00.000Z';
const common = { stageId: STAGE_ID, actions: [{ id: 'speech-1', type: 'speech' as const, text: '先观察数据，再把问题拆成可以验证的小步骤。' }], createdAt: time, updatedAt: time };
export const slide: Scene = {
  ...common, id: SLIDE_ID, outlineId: 'outline-1', type: 'slide', title: '从问题到结构：理解学习过程', order: 1,
  content: { type: 'slide', canvas: {
    id: 'canvas-1', viewportSize: 1000, viewportRatio: 0.5625,
    theme: { backgroundColor: '#f7f9ff', themeColors: ['#3f63e6', '#91a6ef'], fontColor: '#101b38', fontName: 'sans-serif' },
    background: { type: 'gradient', gradient: { type: 'linear', colors: [{ pos: 0, color: '#f7f9ff' }, { pos: 100, color: '#e9efff' }], rotate: 25 } },
    elements: [
      { id: 'title', type: 'text', left: 55, top: 32, width: 880, height: 72, content: '<p style="font-size:34px;font-weight:700">让学习过程变得可观察</p>', defaultFontName: 'sans-serif', defaultColor: '#101b38' },
      { id: 'concept', type: 'shape', left: 65, top: 160, width: 330, height: 120, viewBox: '0 0 330 120', path: 'M0 0H330V120H0Z', fill: '#dce5ff', fixedRatio: false, rotate: -3 },
      { id: 'explanation', type: 'text', left: 85, top: 172, width: 285, height: 95, content: '<p style="font-size:24px">问题 → 观察 → 验证</p>', defaultFontName: 'sans-serif', defaultColor: '#101b38' },
      { id: 'connector', type: 'line', left: 90, top: 320, width: 3, height: 1, start: [0, 0], end: [290, 0], style: 'solid', color: '#3f63e6', points: ['', 'arrow'] },
      { id: 'chart', type: 'chart', left: 460, top: 132, width: 455, height: 285, chartType: 'column', data: { labels: ['观察', '练习', '复盘'], legends: ['投入'], series: [[3, 6, 4]] }, themeColors: ['#3f63e6'] },
      { id: 'formula', type: 'latex', left: 70, top: 390, width: 330, height: 75, latex: 'E = mc^2', html: katex.renderToString('E = mc^2', { throwOnError: false }), color: '#101b38', fixedRatio: true },
      { id: 'footnote', type: 'text', left: 60, top: 495, width: 860, height: 42, content: '<p style="font-size:18px">每一个小步骤，都应该有可以观察的结果。</p>', defaultFontName: 'sans-serif', defaultColor: '#52617e' },
    ],
  } },
};
export const tallSlide: Scene = {
  ...slide, title: '非 16:9 画布：保留原始比例',
  content: slide.content.type === 'slide' ? { type: 'slide', canvas: { ...slide.content.canvas, viewportRatio: 0.75 } } : slide.content,
};
export const unsafeSlide: Scene = {
  ...slide, title: '受控展示与无法显示的元素',
  content: slide.content.type === 'slide' ? { type: 'slide', canvas: { ...slide.content.canvas, elements: [
    ...slide.content.canvas.elements.filter((element) => element.id !== 'footnote'),
    { id: 'unsafe', type: 'text', left: 50, top: 485, width: 650, height: 65, content: '<p onclick="document.body.dataset.unsafe=1" style="font-size:20px;background-image:url(https://example.invalid/pixel)">保留安全文字<a href="javascript:alert(1)">，移除危险链接</a><img src="x" onerror="alert(1)"><script>alert(1)</script></p>', defaultFontName: 'sans-serif', defaultColor: '#101b38' },
    { id: 'unsupported', type: 'image', left: 750, top: 455, width: 180, height: 75, src: '/not-loaded.png', fixedRatio: true },
    { id: 'invalid-chart', type: 'chart', left: 720, top: 90, width: 220, height: 40, chartType: 'unknown', data: { values: [1] }, themeColors: ['#3f63e6'] },
  ] } } : slide.content,
};
export const questions: QuizQuestion[] = [
  { id: 'single-1', type: 'single', question: '哪一种做法最有利于验证自己的理解？', points: 2, analysis: '通过独立解释和练习，才能观察是否真正理解。', options: [{ value: 'A', label: '只记录看过的内容' }, { value: 'B', label: '独立解释并完成练习' }, { value: 'C', label: '跳过所有反馈' }], answer: ['B'] },
  { id: 'multiple-1', type: 'multiple', question: '一个可检查的小步骤需要哪些要素？可选择多个答案。', points: 3, analysis: '明确行动和观察结果能帮助复盘，结果可以用于调整下一步。', options: [{ value: 'A', label: '具体行动' }, { value: 'B', label: '可观察的结果' }, { value: 'C', label: '只靠模糊的感觉判断完成' }], answer: ['A', 'B'] },
  { id: 'short-1', type: 'short_answer', question: '请用自己的话，说明如何把“学会一个新概念”拆成可以验证的小步骤，并说明你会如何观察结果。', points: 5, analysis: '先解释概念，再完成小练习，最后检查错误并调整。', commentPrompt: '依据解释、练习和结果检查三个方面评分。' },
];
export const quizScene: Scene = { ...common, id: QUIZ_ID, outlineId: 'outline-2', type: 'quiz', title: '练习：把理解转成行动', order: 2, content: { type: 'quiz', questions } };
export const closingScene: Scene = { ...slide, id: END_ID, outlineId: 'outline-3', title: '课程回顾与下一步：把本课内容整理为可以检查的实践步骤', order: 3 };
export const directory: ClassroomDirectoryEntry[] = [
  { outlineId: 'outline-1', type: 'slide', title: slide.title, order: 1, ready: true, sceneId: SLIDE_ID },
  { outlineId: 'outline-2', type: 'quiz', title: quizScene.title, order: 2, ready: true, sceneId: QUIZ_ID },
  { outlineId: 'outline-3', type: 'slide', title: closingScene.title, order: 3, ready: false, sceneId: null },
];
export function sampleRecord(question: QuizQuestion, status: 'pending' | 'processing' | 'failed' | 'completed', expired = false): QuizSubmission {
  const answer = question.type === 'single' ? { type: 'single' as const, value: 'B' } : question.type === 'multiple' ? { type: 'multiple' as const, values: ['A', 'B'] } : { type: 'short_answer' as const, text: '先用自己的话解释，再完成一道小练习，检查结果并改正。' };
  return {
    stageId: STAGE_ID, sceneId: QUIZ_ID, questionId: question.id, submissionId: '55555555-5555-4555-8555-555555555555', version: 1, answer, status,
    result: status === 'completed' ? question.type === 'short_answer' ? { type: 'short_answer', earned: 4, points: question.points, analysis: question.analysis, comment: '示例评语：步骤清楚，可进一步明确检查标准。' }
      : { type: question.type, earned: question.points, points: question.points, analysis: question.analysis, correct: true, correctAnswer: question.answer } : null,
    failureCode: status === 'failed' ? 'MODEL_CALL_FAILED' : null,
    gradingRequestId: status === 'processing' ? '66666666-6666-4666-8666-666666666666' : null,
    executionId: status === 'processing' ? '77777777-7777-4777-8777-777777777777' : null,
    gradingStartedAt: status === 'processing' ? time : null, gradingExpiresAt: status === 'processing' ? '2026-10-22T00:02:00.000Z' : null,
    gradedAt: status === 'completed' ? time : null, executionExpired: expired, createdAt: time, updatedAt: time,
  };
}
export const effectOptions = ['none', 'spotlight', 'laser', 'widget_highlight', 'widget_annotation', 'widget_setState', 'missing', 'unknown_state'] as const;
export function sampleEffects(mode: typeof effectOptions[number], quiz: boolean): TeachingEffect[] {
  const target = quiz ? 'short-1' : 'concept';
  switch (mode) {
    case 'spotlight': return quiz ? [] : [{ id: 'effect', type: 'spotlight', elementId: target }];
    case 'laser': return quiz ? [] : [{ id: 'effect', type: 'laser', elementId: 'chart' }];
    case 'widget_highlight': return [{ id: 'effect', type: mode, target }];
    case 'widget_annotation': return [{ id: 'effect', type: mode, target, content: '先关注这一部分，再用自己的话解释。' }];
    case 'widget_setState': return [{ id: 'effect', type: mode, state: { message: '请先观察变化，再继续讲解。' } }];
    case 'missing': return [{ id: 'effect', type: 'widget_annotation', target: 'unavailable', content: '找不到目标' }];
    case 'unknown_state': return [{ id: 'effect', type: 'widget_setState', state: { unsupported: { nested: true } } }];
    default: return [];
  }
}
