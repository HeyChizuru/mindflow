'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatSession } from '@/lib/types/chat-session';
import { ClassroomChatSessions } from '@/lib/client/classroom-chat-sessions';
import { modelRequestHeaders } from '@/lib/client/llm/settings';

type AppRouter = ReturnType<typeof useRouter>;

/** 当前课堂页内用 replaceState 写回 chatSession / chatOpen，不触发整页导航。 */
function createChatUrlSync(stageId: string) {
  return (id: string | null, open: boolean) => {
    const url = new URL(window.location.href);
    if (url.pathname.toLowerCase() !== '/classroom/' + stageId) return;
    url.searchParams.set('chatSession', id ?? 'none');
    if (open) url.searchParams.set('chatOpen', '1');
    else url.searchParams.delete('chatOpen');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  };
}

/** 跨课堂打开会话时走客户端路由，并带上会话与展开参数。 */
function navigateToChatSession(router: AppRouter, session: ChatSession) {
  router.push(
    '/classroom/' +
    session.stageId +
    '?' +
    new URLSearchParams({ chatSession: session.id, chatOpen: '1' }),
  );
}

/**
 * 将课堂聊天会话控制器接到 React；列表、选中态与消息由 ClassroomChatSessions 维护。
 * selection / openIntent 通常来自 URL，挂载后 restore 对齐。
 */
export function useClassroomChat(stageId: string, selection?: string, openIntent = false) {
  const router = useRouter();

  const chat = useMemo(
    () =>
      new ClassroomChatSessions(stageId, modelRequestHeaders, {
        replace: createChatUrlSync(stageId),
        navigate: (session) => navigateToChatSession(router, session),
      }),
    [stageId, router],
  );

  useEffect(() => {
    chat.start();
    return () => chat.dispose();
  }, [chat]);

  useEffect(() => {
    void chat.restore(selection, openIntent);
  }, [chat, selection, openIntent]);

  const sessions = useSyncExternalStore(chat.subscribe, chat.getSnapshot, chat.getSnapshot);

  return {
    chat,
    sessions,
    // 消息子状态 + 面板开关（open 在 sessions 层，message 在子控制器）
    state: { ...sessions.message, open: sessions.open },
  };
}