'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

const key = 'mindflow:pending-classroom-deletions';
const prefix = `${key}:`;
const itemSchema = z.object({ id: z.uuid(), name: z.string() });
const schema = z.array(itemSchema);
type PendingDeletion = z.infer<typeof itemSchema>;

function withLocalHints(hints: PendingDeletion[], unsaved: Map<string, PendingDeletion | null>) {
  const merged = new Map(hints.map(item => [item.id, item]));
  for (const [id, item] of unsaved) { if (item) merged.set(id, item); else merged.delete(id); }
  return [...merged.values()];
}

function readHints(): PendingDeletion[] {
  // Migrate the former shared array before reading independently stored identities.
  const hints = new Map<string, PendingDeletion>();
  let legacy: PendingDeletion[] = [];
  const rawLegacy = localStorage.getItem(key);
  try {
    const parsed = schema.safeParse(JSON.parse(rawLegacy ?? '[]'));
    if (parsed.success) legacy = parsed.data;
  } catch { /* Invalid legacy JSON must not hide independently stored hints. */ }
  if (legacy.length) {
    for (const item of legacy) hints.set(item.id, item);
    try {
      for (const item of legacy) {
        if (localStorage.getItem(`${prefix}${item.id}`) === null) localStorage.setItem(`${prefix}${item.id}`, JSON.stringify(item));
      }
      localStorage.removeItem(key);
    } catch { /* Show legacy hints even if migration cannot be persisted. */ }
  }
  for (let index = 0; index < localStorage.length; index++) {
    const storedKey = localStorage.key(index);
    if (!storedKey?.startsWith(prefix)) continue;
    try {
      const parsed = itemSchema.safeParse(JSON.parse(localStorage.getItem(storedKey) ?? 'null'));
      if (parsed.success && storedKey === `${prefix}${parsed.data.id}`) hints.set(parsed.data.id, parsed.data);
    } catch { /* A malformed hint must not hide unrelated recovery entries. */ }
  }
  return [...hints.values()];
}

/** Recovery hints only. Existence and cleanup results are always checked on the server. */
export function usePendingDeletions() {
  const [pending, setPending] = useState<PendingDeletion[]>([]);
  const current = useRef<PendingDeletion[]>([]);
  const unsaved = useRef(new Map<string, PendingDeletion | null>());
  useEffect(() => {
    function sync() {
      try {
        const hints = withLocalHints(readHints(), unsaved.current);
        current.current = hints; setPending(hints);
      } catch { /* A cache failure never changes the server's deletion result. */ }
    }
    const timer = setTimeout(sync, 0);
    function onStorage(event: StorageEvent) {
      if (event.storageArea === localStorage && (event.key === null || event.key === key || event.key.startsWith(prefix))) sync();
    }
    window.addEventListener('storage', onStorage);
    return () => { clearTimeout(timer); window.removeEventListener('storage', onStorage); };
  }, []);
  const update = useCallback((id: string, item?: PendingDeletion) => {
    let previous = current.current;
    try { previous = withLocalHints(readHints(), unsaved.current); } catch { /* Keep in-memory recovery available when storage is blocked. */ }
    const next = [...previous.filter(row => row.id !== id), ...(item ? [item] : [])];
    current.current = next; setPending(next);
    try {
      if (item) localStorage.setItem(`${prefix}${id}`, JSON.stringify(item)); else localStorage.removeItem(`${prefix}${id}`);
      unsaved.current.delete(id);
    } catch { unsaved.current.set(id, item ?? null); }
  }, []);
  return { pending,
    remember: (item: PendingDeletion) => update(item.id, { id: item.id, name: item.name }),
    forget: (id: string) => update(id),
  };
}
