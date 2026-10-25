'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ClassroomSession } from '@/lib/client/classroom-session';
import { outlineRequestHeaders } from '@/lib/client/llm/dev-headers';

export function useClassroom(stageId: string) {
  const session = useMemo(() => new ClassroomSession(stageId, outlineRequestHeaders), [stageId]);
  useEffect(() => {
    session.start();
    const refreshVisible = () => { if (document.visibilityState === 'visible') void session.refresh(); };
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { document.removeEventListener('visibilitychange', refreshVisible); session.dispose(); };
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, state };
}
