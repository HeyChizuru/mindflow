'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneOutline } from '@/lib/types/outline';

/** 阶段 B 假数据：一条 slide + 一条带 quizConfig 的 quiz。阶段 C 删除本文件。 */
export const STATIC_MOCK_OUTLINES: SceneOutline[] = [
  {
    id: 'mock-slide-1',
    type: 'slide',
    title: '课程导入：核心概念',
    description: '用生活化例子引出本课主题，明确学习目标。',
    keyPoints: ['为什么要学', '学完能做什么'],
    order: 1,
  },
  {
    id: 'mock-quiz-1',
    type: 'quiz',
    title: '随堂测验',
    description: '检查学生对导入内容的理解程度。',
    keyPoints: ['单选题为主'],
    order: 2,
    quizConfig: {
      questionCount: 3,
      difficulty: 'medium',
      questionTypes: ['single'],
    },
  },
];

const APPEND_INTERVAL_MS = 700;

/**
 * 模拟大纲 SSE：逐条追加 STATIC_MOCK_OUTLINES，不写 storage。
 * 阶段 C 由真实流式客户端替代。
 */
export function useStaticOutlineMock() {
  const [outlines, setOutlines] = useState<SceneOutline[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [runId, setRunId] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timersRef.current = timers;

    STATIC_MOCK_OUTLINES.forEach((outline, index) => {
      const timer = setTimeout(() => {
        setOutlines((prev) => [...prev, { ...outline, order: prev.length + 1 }]);
        if (index === STATIC_MOCK_OUTLINES.length - 1) {
          setIsStreaming(false);
        }
      }, APPEND_INTERVAL_MS * (index + 1));
      timers.push(timer);
    });

    return () => {
      for (const id of timers) {
        clearTimeout(id);
      }
    };
  }, [runId]);

  const restart = useCallback(() => {
    for (const id of timersRef.current) {
      clearTimeout(id);
    }
    timersRef.current = [];
    setOutlines([]);
    setIsStreaming(true);
    setRunId((n) => n + 1);
  }, []);

  return { outlines, setOutlines, isStreaming, restart };
}
