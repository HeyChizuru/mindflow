'use client';
import type { SlideElement } from '@/lib/types/scene';
export function HighlightOverlay({ elements, targetIds }: { elements: SlideElement[]; targetIds: string[] }) {
  return <>{elements.filter((item) => targetIds.includes(item.id)).map((item) =>
    <div key={item.id} aria-hidden="true" className="pointer-events-none absolute rounded border-4 border-primary bg-primary/10"
      style={{ left: item.left, top: item.top, width: item.width, height: Math.max(item.height, 4), transform: 'rotate(' + (item.rotate ?? 0) + 'deg)' }} />)}</>;
}
