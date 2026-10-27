'use client';

import { PlaybackChromeRoot } from '@/components/edit/PlaybackChromeRoot';

export function Stage({ stageId, chatSelection, chatOpen }: { stageId: string; chatSelection?: string; chatOpen?: boolean }) {
  return <PlaybackChromeRoot stageId={stageId} chatSelection={chatSelection} chatOpen={chatOpen} />;
}
