'use client';

import { ScreenCanvas } from './ScreenCanvas';

/** Read-only slide renderer used by classroom playback. */
export function SlideEditor() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <ScreenCanvas />
      </div>
    </div>
  );
}
