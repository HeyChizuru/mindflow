'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ClassroomChatSessions } from '@/lib/client/classroom-chat-sessions';
import { outlineRequestHeaders } from '@/lib/client/llm/dev-headers';

export function useClassroomChat(stageId: string, selection?: string, openIntent = false) {
  const router = useRouter();
  const chat = useMemo(() => new ClassroomChatSessions(stageId, outlineRequestHeaders, {
    replace: (id, open) => {
      const url = new URL(window.location.href);
      if (url.pathname.toLowerCase() !== '/classroom/' + stageId) return;
      url.searchParams.set('chatSession', id ?? 'none');
      if (open) url.searchParams.set('chatOpen', '1'); else url.searchParams.delete('chatOpen');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    },
    navigate: (session) => router.push('/classroom/' + session.stageId + '?' + new URLSearchParams({ chatSession: session.id, chatOpen: '1' })),
  }), [stageId, router]);
  useEffect(() => { chat.start(); return () => chat.dispose(); }, [chat]);
  useEffect(() => { void chat.restore(selection, openIntent); }, [chat, selection, openIntent]);
  const sessions = useSyncExternalStore(chat.subscribe, chat.getSnapshot, chat.getSnapshot);
  return { chat, sessions, state: { ...sessions.message, open: sessions.open } };
}
