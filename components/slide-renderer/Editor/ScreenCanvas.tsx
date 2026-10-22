'use client';

import { ScreenElement } from './ScreenElement';
import { HighlightOverlay } from './HighlightOverlay';
import { SpotlightOverlay } from './SpotlightOverlay';
import { LaserOverlay } from './LaserOverlay';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { findElementGeometry } from '@/lib/utils/geometry';
import type { SceneContent, SlideCanvas, SlideBackground } from '@/lib/types/scene';
import type { PercentageGeometry } from '@/lib/types/action';
import { useViewportSize } from '../hooks/useViewportSize';
import { useRef, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';

type SlideContent = Extract<SceneContent, { type: 'slide' }>;

export function ScreenCanvas() {
  const canvasScale = useCanvasStore.use.canvasScale();
  const canvas = useSceneSelector<SlideContent, SlideCanvas>((content) => content.canvas);
  const elements = canvas.elements;
  const canvasRef = useRef<HTMLDivElement>(null);

  // Viewport size and positioning
  const { viewportStyles } = useViewportSize(canvasRef, canvas);

  // Get background style
  const background = useSceneSelector<SlideContent, SlideBackground | undefined>(
    (content) => content.canvas.background,
  );
  const { backgroundStyle } = useSlideBackgroundStyle(background);

  // Get visual effect state
  const laserElementId = useCanvasStore.use.laserElementId();
  const laserOptions = useCanvasStore.use.laserOptions();
  const zoomTarget = useCanvasStore.use.zoomTarget();

  // Compute laser pointer geometry
  const laserGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!laserElementId) return null;
    const element = elements.find((el) => el.id === laserElementId);
    if (!element) return null;
    return findElementGeometry(
      { type: 'slide', content: { canvas } },
      laserElementId,
      canvas.viewportSize,
    );
  }, [laserElementId, elements, canvas]);

  // Compute zoom target geometry
  const zoomGeometry = useMemo<PercentageGeometry | null>(() => {
    if (!zoomTarget) return null;
    const element = elements.find((el) => el.id === zoomTarget.elementId);
    if (!element) return null;
    return findElementGeometry(
      { type: 'slide', content: { canvas } },
      zoomTarget.elementId,
      canvas.viewportSize,
    );
  }, [zoomTarget, elements, canvas]);

  return (
    <div className="relative h-full w-full overflow-hidden select-none" ref={canvasRef}>
      <div
        className="absolute shadow-[0_0_0_1px_rgba(0,0,0,0.01),0_0_12px_0_rgba(0,0,0,0.1)] rounded-lg overflow-hidden transition-transform duration-700"
        style={{
          width: `${viewportStyles.width * canvasScale}px`,
          height: `${viewportStyles.height * canvasScale}px`,
          left: `${viewportStyles.left}px`,
          top: `${viewportStyles.top}px`,
          ...(zoomTarget && zoomGeometry
            ? {
              transform: `scale(${zoomTarget.scale})`,
              transformOrigin: `${zoomGeometry.centerX}% ${zoomGeometry.centerY}%`,
            }
            : {}),
        }}
      >
        {/* Background layer */}
        <div
          className="w-full h-full bg-position-center rounded-lg"
          style={{ ...backgroundStyle }}
        ></div>

        {/* Content layer - scaled */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: `${viewportStyles.width}px`,
            height: `${viewportStyles.height}px`,
            transform: `scale(${canvasScale})`,
          }}
        >
          {elements.map((element, index) => (
            <ScreenElement key={element.id} elementInfo={element} elementIndex={index + 1} />
          ))}

          {/* Highlight overlay - stacked above elements */}
          <HighlightOverlay />
        </div>

        {/* Spotlight overlay - covers the entire slide, positioned via DOM measurement */}
        <SpotlightOverlay />

        {/* Visual effects layer - outside the scale layer, using percentage coordinates */}
        <div className="absolute inset-0 pointer-events-none" style={{ padding: '5%' }}>
          <div className="relative w-full h-full">
            {/* Laser pointer overlay */}
            <AnimatePresence>
              {laserElementId && laserGeometry && (
                <LaserOverlay
                  key={`laser-${laserElementId}`}
                  geometry={laserGeometry}
                  color={laserOptions?.color}
                  duration={laserOptions?.duration}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
