'use client';

import { PlaybackChromeRoot } from '@/components/edit/PlaybackChromeRoot';

export function Stage({ stageId }: { stageId: string }) {
  return <PlaybackChromeRoot stageId={stageId} />;
}
