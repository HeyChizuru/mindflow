'use client';

import { useRef } from 'react';
import { ScreenElement } from './ScreenElement';
import { SpotlightOverlay } from './SpotlightOverlay';
import { HighlightOverlay } from './HighlightOverlay';
import { LaserOverlay } from './LaserOverlay';
import { TeachingFeedback } from '@/components/stage/teaching-feedback';
import { useSlideBackgroundStyle } from '@/lib/hooks/use-slide-background-style';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useViewportSize } from '../hooks/useViewportSize';
import type { SceneContent, SlideElement } from '@/lib/types/scene';
import type { TeachingEffect } from '@/components/stage/classroom-view-types';
import type { PercentageGeometry } from '@/lib/types/action';

type SlideContent = Extract<SceneContent, { type: 'slide' }>;
function geometry(element: SlideElement | undefined, width: number, height: number): PercentageGeometry | null {
  if (!element) return null;
  const angle = (element.rotate ?? 0) * Math.PI / 180;
  const w = Math.abs(element.width * Math.cos(angle)) + Math.abs(element.height * Math.sin(angle));
  const h = Math.abs(element.width * Math.sin(angle)) + Math.abs(element.height * Math.cos(angle));
  const centerX = (element.left + element.width / 2) / width * 100;
  const centerY = (element.top + element.height / 2) / height * 100;
  return { x: centerX - w / width * 50, y: centerY - h / height * 50, w: w / width * 100, h: h / height * 100, centerX, centerY };
}
export function ScreenCanvas({ effects }: { effects?: TeachingEffect[] }) {
  const canvas = useSceneSelector<SlideContent, SlideContent['canvas']>((content) => content.canvas);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { scale, viewportStyles } = useViewportSize(canvasRef, canvas);
  const { backgroundStyle } = useSlideBackgroundStyle(canvas.background);
  const store = useCanvasStore();
  const spotlight = effects === undefined ? store.spotlightElementId : effects.find((effect) => effect.type === 'spotlight')?.elementId;
  const laser = effects === undefined ? store.laserElementId : effects.find((effect) => effect.type === 'laser')?.elementId;
  const highlights = effects === undefined ? store.highlightedElementIds : effects.filter((effect) => effect.type === 'widget_highlight').map((effect) => effect.target);
  const annotations = (effects ?? []).filter((effect) => effect.type === 'widget_annotation');
  const unlocated = (effects ?? []).filter((effect) => 'target' in effect ? !canvas.elements.some((item) => item.id === effect.target) : 'elementId' in effect ? !canvas.elements.some((item) => item.id === effect.elementId) : false);
  const w = canvas.viewportSize, h = w * canvas.viewportRatio;
  return <div ref={canvasRef} className="relative size-full overflow-hidden" aria-label="幻灯片">
    <div className="absolute isolate overflow-hidden rounded-lg shadow-lg" data-testid="slide-canvas"
      style={{ left: viewportStyles.left, top: viewportStyles.top, width: w * scale, height: h * scale }}>
      <div className="absolute origin-top-left" style={{ width: w, height: h, transform: 'scale(' + scale + ')', backgroundColor: canvas.theme.backgroundColor, ...backgroundStyle }}>
        {canvas.elements.map((element, index) => <ScreenElement key={element.id} elementInfo={element} elementIndex={index + 1} />)}
        <div className="pointer-events-none absolute inset-0 z-[100]"><HighlightOverlay elements={canvas.elements} targetIds={highlights} /></div>
      </div>
      <div className="pointer-events-none absolute inset-0 z-[101]">
        <SpotlightOverlay geometry={geometry(canvas.elements.find((item) => item.id === spotlight), w, h)} />
        {laser && geometry(canvas.elements.find((item) => item.id === laser), w, h) &&
          <LaserOverlay geometry={geometry(canvas.elements.find((item) => item.id === laser), w, h)!} />}
      </div>
    </div>
    <div className="pointer-events-none absolute inset-0 z-[102]">
      {annotations.map((effect) => {
        const element = canvas.elements.find((item) => item.id === effect.target);
        if (!element) return null;
        const box = geometry(element, w, h)!;
        return <div key={effect.id} className="absolute max-h-32 w-64 max-w-[85%] overflow-y-auto"
          style={{ left: Math.min(viewportStyles.left + (box.x + box.w / 2) / 100 * w * scale, Math.max(8, w * scale + viewportStyles.left - 256)),
            top: Math.max(0, Math.min(viewportStyles.top + (box.y + box.h) / 100 * h * scale, viewportStyles.top + h * scale - 95)) }}>
          <TeachingFeedback effects={[effect]} targetId={effect.target} />
        </div>;
      })}
    </div>
    <div className="absolute left-3 right-3 top-3 z-[103] flex flex-col gap-1">
      <TeachingFeedback effects={effects} />
      {unlocated.length > 0 && <p role="status" className="rounded border bg-background p-2 text-sm">教学效果未找到对应元素，其他内容仍可观看。</p>}
    </div>
  </div>;
}
