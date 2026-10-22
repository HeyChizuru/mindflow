import { useState, useEffect, useMemo, useCallback, type RefObject } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import type { SlideCanvas } from '@/lib/types/scene';

export interface ViewportStyles {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Fit the saved canvas to its container without editor dragging state. */
export function useViewportSize(
  canvasRef: RefObject<HTMLElement | null>,
  viewport: Pick<SlideCanvas, 'viewportSize' | 'viewportRatio'>,
) {
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const canvasPercentage = useCanvasStore.use.canvasPercentage();
  const setCanvasScale = useCanvasStore.use.setCanvasScale();
  const setViewportSize = useCanvasStore.use.setViewportSize();
  const setViewportRatio = useCanvasStore.use.setViewportRatio();
  const { viewportSize, viewportRatio } = viewport;

  const fitViewport = useCallback(() => {
    if (!canvasRef.current) return;
    const { clientWidth, clientHeight } = canvasRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    // Preserve the source fit calculation and available-space percentage.
    const actualWidth = clientHeight / clientWidth > viewportRatio
      ? clientWidth * (canvasPercentage / 100)
      : (clientHeight * (canvasPercentage / 100)) / viewportRatio;
    setCanvasScale(actualWidth / viewportSize);
    setViewportSize(viewportSize);
    setViewportRatio(viewportRatio);
    setPosition({
      left: (clientWidth - actualWidth) / 2,
      top: (clientHeight - actualWidth * viewportRatio) / 2,
    });
  }, [canvasRef, canvasPercentage, viewportSize, viewportRatio,
    setCanvasScale, setViewportSize, setViewportRatio]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const frame = requestAnimationFrame(fitViewport);
    const observer = new ResizeObserver(fitViewport);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [canvasRef, fitViewport]);

  const viewportStyles: ViewportStyles = useMemo(() => ({
    width: viewportSize,
    height: viewportSize * viewportRatio,
    left: position.left,
    top: position.top,
  }), [viewportSize, viewportRatio, position]);

  return { viewportStyles };
}
