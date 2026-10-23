'use client';
import { useId } from 'react';
import type { PercentageGeometry } from '@/lib/types/action';

export function SpotlightOverlay({ geometry, dimness = 0.5 }: { geometry?: PercentageGeometry | null; dimness?: number }) {
  const maskId = useId();
  if (!geometry) return null;
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs><mask id={maskId}><rect width="100" height="100" fill="white" /><rect x={geometry.x} y={geometry.y} width={geometry.w} height={geometry.h} rx="1" fill="black" /></mask></defs>
    <rect width="100" height="100" fill={'rgba(0,0,0,' + dimness + ')'} mask={'url(#' + maskId + ')'} />
  </svg>;
}
