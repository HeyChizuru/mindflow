'use client';

import { useState } from 'react';
import type { ChatPresentation } from '@/components/stage/classroom-view-types';
import type { ClassroomChatItem } from '@/lib/client/classroom-chat';
import type { ChatSession } from '@/lib/types/chat-session';
import { SLIDE_ID, STAGE_ID } from './fixtures';

export const chatModes = ['completed', 'empty', 'none', 'reading', 'waiting', 'unsaved', 'unknown', 'failed', 'readFailed'] as const;
export type ChatPreviewMode = typeof chatModes[number];
export const chatModeLabels = ['长回答与引用', '新会话', '未选择会话', '读取中', '等待回复', '问题未保存', '保存待确认', '回答失败', '读取失败'];
const time = '2026-10-27T01:00:00.000Z';
const samples: ChatSession[] = [
  { id: 'preview-session-1', stageId: STAGE_ID, stageName: '学习方法：从问题到可验证的行动', preview: '怎样判断自己理解了一个概念？', isHistory: false, createdAt: time, lastUsedAt: time },
  { id: 'preview-session-2', stageId: STAGE_ID, stageName: '学习方法：从问题到可验证的行动', preview: '很长的会话标题示例：把复杂问题拆成可观察、可验证的小步骤，并在真实项目中实践和复盘', isHistory: false, createdAt: time, lastUsedAt: time },
  { id: 'preview-other', stageId: 'preview-other-course', stageName: '另一课堂：React 状态与组件设计', preview: '如何选择状态的归属？', isHistory: false, createdAt: time, lastUsedAt: time },
];
const answer = [
  '### 让理解变成可以观察的结果',
  '可以从**解释、练习、检查**三个动作开始。看懂答案只是其中一步，独立完成更容易发现还不确定的地方。',
  '1. 用自己的话解释这个概念。\n2. 换一个例子，尝试独立完成。\n3. 对照结果，写下具体的卡点。',
  '> 例如，学习数组的 map 时，可以先解释它如何转换每一项，再写一个小例子。',
  '```ts\nconst steps = ["解释", "练习", "检查"];\nconst checklist = steps.map((step, index) => ({ id: index, step, done: false }));\n```',
  '| 行动 | 可以观察的结果 |\n| --- | --- |\n| 自己解释 | 能说清输入、过程和输出 |\n| 独立练习 | 能完成一个不同于原例的小题 |\n| 检查结果 | 能指出哪里出错，并调整下一步 |',
  '### 接下来可以怎么做',
  '选一个今天正在学的概念，用三句话解释，再做一道小练习。把你写的解释发来，我们可以一起检查哪里需要补充。',
].join('\n\n');

/** Development-only visual samples: no HTTP, model calls, or persistent writes. */
export function useChatPreview(onOpen: () => void) {
  const [mode, setMode] = useState<ChatPreviewMode>('completed');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sessions, setSessions] = useState(samples);
  const [selection, setSelection] = useState(samples[0].id);
  const selected = mode === 'none' || mode === 'reading' ? null : sessions.find((item) => item.id === selection) ?? null;
  const items: Record<string, ClassroomChatItem> = {};
  if (selected && !['empty', 'readFailed'].includes(mode)) {
    const count = mode === 'completed' ? 4 : 1;
    for (let index = 0; index < count; index++) {
      const requestId = 'preview-turn-' + index;
      const submission = { stageId: STAGE_ID, sessionId: selected.id, sceneId: SLIDE_ID, requestId,
        question: index ? '能换个例子再解释一下吗？' : '怎样判断自己理解了一个概念？请给我一个可以实际尝试的方法。' };
      const status = mode === 'completed' ? 'completed' : mode === 'failed' ? 'failed' : 'pending';
      items[requestId] = {
        submission, busy: mode === 'waiting', checking: false,
        ...(mode === 'unsaved' ? { issue: 'unsaved' as const, code: 'NOT_SAVED' as const }
          : mode === 'unknown' ? { issue: 'unknown' as const, code: 'SAVE_UNKNOWN' as const } : {}),
        ...(!['unsaved', 'unknown', 'waiting'].includes(mode) ? { record: {
          ...submission, id: requestId, status, reply: status === 'completed' ? answer : null,
          teacherId: status === 'completed' ? index % 2 ? 'application_coach' : 'explainer' : null,
          sources: status === 'completed' ? [{ chunkId: 'sample-chunk', documentId: 'sample-document', filename: '学习方法示例讲义.pdf', page: 12, excerpt: '展示样例：把学习目标转成具体行动，为每个步骤定义可以观察的结果。此内容仅用于界面预览，不代表实际检索结果。' }] : null,
          failureCode: status === 'failed' ? 'MODEL_FAILED' : null,
          executionId: null, executionStartedAt: null, executionExpiresAt: null, executionExpired: false,
          completedAt: status === 'completed' ? time : null, createdAt: time, updatedAt: time,
        } } : {}),
      };
    }
  }
  const chat: ChatPresentation = {
    state: { open, draft, draftRequestId: mode === 'unsaved' || mode === 'unknown' || mode === 'waiting' ? 'preview-turn-0' : null,
      reading: mode === 'reading', loaded: mode !== 'reading', readFailed: mode === 'readFailed', unavailable: false, items },
    canSend: !!selected,
    sessions: {
      state: { open, sessions, selected, message: { open, draft, draftRequestId: null, reading: false, loaded: true, readFailed: false, unavailable: false, items },
        reading: mode === 'reading', loaded: mode !== 'reading', creating: false, selecting: null, deletions: {}, error: mode === 'readFailed' ? 'readFailed' : null },
      onCreate: () => { setSessions(samples); setSelection(samples[0].id); setMode('empty'); },
      onSelect: (item) => { if (item.stageId === STAGE_ID) { setSelection(item.id); setMode('completed'); } },
      onDelete: (item) => { setSessions((list) => list.filter((entry) => entry.id !== item.id)); if (item.id === selection) setMode('none'); },
      onCheckDeletion: () => {}, onRefresh: () => {},
    },
    onOpen: () => { setOpen(true); onOpen(); }, onClose: () => setOpen(false), onChange: setDraft,
    onSend: () => { setDraft(''); setMode('waiting'); },
    onRefresh: () => { if (mode === 'readFailed' || mode === 'reading') setMode('completed'); },
    onRead: () => setMode('completed'), onRecover: () => setMode('waiting'),
  };
  return { chat, mode, setMode };
}
