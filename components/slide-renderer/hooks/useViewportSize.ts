import { useState, useEffect, useMemo, type RefObject } from 'react';
import type { SlideCanvas } from '@/lib/types/scene';

export function useViewportSize(canvasRef: RefObject<HTMLElement | null>, viewport: Pick<SlideCanvas, 'viewportSize' | 'viewportRatio'>) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBounds((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvasRef]);
  return useMemo(() => {
    const width = viewport.viewportSize;
    const height = width * viewport.viewportRatio;
    const scale = Math.max(0, Math.min(bounds.width / width, bounds.height / height) * 0.94);
    return { scale, viewportStyles: { width, height, left: (bounds.width - width * scale) / 2, top: (bounds.height - height * scale) / 2 } };
  }, [bounds, viewport.viewportSize, viewport.viewportRatio]);
}
