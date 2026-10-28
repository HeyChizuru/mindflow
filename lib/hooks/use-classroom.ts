'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ClassroomSession } from '@/lib/client/classroom-session';
import { modelRequestHeaders } from '@/lib/client/llm/settings';

export function useClassroom(stageId: string) {
  const session = useMemo(() => new ClassroomSession(stageId, modelRequestHeaders), [stageId]);
  useEffect(() => {
    session.start();
    const refreshVisible = () => { if (document.visibilityState === 'visible') void session.refresh(); };
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { document.removeEventListener('visibilitychange', refreshVisible); session.dispose(); };
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, state };
}
