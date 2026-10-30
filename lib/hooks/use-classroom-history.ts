'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listStageHistory } from '@/lib/client/stages/history';
import type { StageHistoryPage } from '@/lib/types/stage-history';

const empty: StageHistoryPage = { items: [], total: 0, matched: 0, nextCursor: null };

export function useClassroomHistory() {
  const [search, setSearch] = useState('');
  const query = search.trim();
  const [loadedQuery, setLoadedQuery] = useState('');
  const [page, setPage] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);

  const invalidate = useCallback(() => { sequence.current++; controller.current?.abort(); }, []);
  const load = useCallback(async (cursor?: string) => {
    invalidate();
    const version = sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    if (!cursor) {
      setLoadedQuery(query);
      setPage(current => ({ ...current, items: [], matched: 0, nextCursor: null }));
    }
    try {
      const next = await listStageHistory(query, cursor, abort.signal);
      if (version !== sequence.current) return;
      setPage(current => ({ ...next, items: cursor
        ? [...new Map([...current.items, ...next.items].map(item => [item.id, item])).values()] : next.items }));
    } catch (cause) {
      if (version !== sequence.current || abort.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : '读取历史课堂失败，请重试');
    } finally {
      if (version === sequence.current) { loadingRef.current = false; setLoading(false); }
    }
  }, [query, invalidate]);
  const latestLoad = useRef(load);
  useEffect(() => { latestLoad.current = load; }, [load]);
  const refresh = useCallback(() => latestLoad.current(), []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', restore);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', restore); };
  }, [load]);

  const current = loadedQuery === query;
  return { search, setSearch, query, page: current ? page : { ...empty, total: page.total },
    loading: loading || !current, error: current ? error : null, invalidate,
    refresh,
    more: () => { if (!loadingRef.current && page.nextCursor) void load(page.nextCursor); },
  };
}
