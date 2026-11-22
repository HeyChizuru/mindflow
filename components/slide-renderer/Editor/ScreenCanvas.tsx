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

type CanvasEffectStore = Pick<
  ReturnType<typeof useCanvasStore.getState>,
  'spotlightElementId' | 'laserElementId' | 'highlightedElementIds'
>;

export type ScreenCanvasProps = {
  /** 未传时聚光/激光等读 canvas store（编辑预览）；播放时由 ActionEngine 推 effects。 */
  effects?: TeachingEffect[];
};

/** 按元素旋转计算外接框，再映射为百分比坐标，供效果层随画布缩放。 */
function geometry(element: SlideElement | undefined, width: number, height: number): PercentageGeometry | null {
  if (!element) return null;
  const angle = (element.rotate ?? 0) * Math.PI / 180;
  const w = Math.abs(element.width * Math.cos(angle)) + Math.abs(element.height * Math.sin(angle));
  const h = Math.abs(element.width * Math.sin(angle)) + Math.abs(element.height * Math.cos(angle));
  const centerX = (element.left + element.width / 2) / width * 100;
  const centerY = (element.top + element.height / 2) / height * 100;
  return {
    x: centerX - w / width * 50,
    y: centerY - h / height * 50,
    w: w / width * 100,
    h: h / height * 100,
    centerX,
    centerY,
  };
}

/** effects 缺省时对齐 canvas store 中的临时视觉效果 id。 */
function resolveEffectTargets(effects: TeachingEffect[] | undefined, store: CanvasEffectStore) {
  if (effects === undefined) {
    return {
      spotlight: store.spotlightElementId,
      laser: store.laserElementId,
      highlights: store.highlightedElementIds,
    };
  }
  return {
    spotlight: effects.find((effect) => effect.type === 'spotlight')?.elementId,
    laser: effects.find((effect) => effect.type === 'laser')?.elementId,
    highlights: effects.filter((effect) => effect.type === 'widget_highlight').map((effect) => effect.target),
  };
}

/** 教学效果引用的 target / elementId 在当前幻灯片中不存在。 */
function isUnlocatedEffect(effect: TeachingEffect, hasElement: (id: string) => boolean) {
  return 'target' in effect ? !hasElement(effect.target) : 'elementId' in effect ? !hasElement(effect.elementId) : false;
}

/** 幻灯片视口：渲染元素层、聚光/高亮/激光与教学标注。 */
export function ScreenCanvas({ effects }: ScreenCanvasProps) {
  const canvas = useSceneSelector<SlideContent, SlideContent['canvas']>((content) => content.canvas);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { scale, viewportStyles } = useViewportSize(canvasRef, canvas);
  const { backgroundStyle } = useSlideBackgroundStyle(canvas.background);
  const store = useCanvasStore();

  const { spotlight, laser, highlights } = resolveEffectTargets(effects, store);
  const annotations = (effects ?? []).filter((effect) => effect.type === 'widget_annotation');
  const hasElement = (id: string) => canvas.elements.some((item) => item.id === id);
  const unlocated = (effects ?? []).filter((effect) => isUnlocatedEffect(effect, hasElement));

  const w = canvas.viewportSize;
  const h = w * canvas.viewportRatio;
  const elementById = (id: string | undefined) => canvas.elements.find((item) => item.id === id);
  const spotlightGeometry = geometry(elementById(spotlight), w, h);
  const laserGeometry = laser ? geometry(elementById(laser), w, h) : null;

  return (
    <div ref={canvasRef} className="relative size-full overflow-hidden" aria-label="幻灯片">
      {/* 设计分辨率画布 + z100 高亮 / z101 聚光激光 */}
      <div
        className="absolute isolate overflow-hidden rounded-lg shadow-lg"
        data-testid="slide-canvas"
        style={{ left: viewportStyles.left, top: viewportStyles.top, width: w * scale, height: h * scale }}
      >
        <div
          className="absolute origin-top-left"
          style={{
            width: w,
            height: h,
            transform: 'scale(' + scale + ')',
            backgroundColor: canvas.theme.backgroundColor,
            ...backgroundStyle,
          }}
        >
          {canvas.elements.map((element, index) => (
            <ScreenElement key={element.id} elementInfo={element} elementIndex={index + 1} />
          ))}
          <div className="pointer-events-none absolute inset-0 z-[100]">
            <HighlightOverlay elements={canvas.elements} targetIds={highlights} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-[101]">
          <SpotlightOverlay geometry={spotlightGeometry} />
          {laserGeometry && <LaserOverlay geometry={laserGeometry} />}
        </div>
      </div>

      {/* z102 元素旁标注 */}
      <div className="pointer-events-none absolute inset-0 z-[102]">
        {annotations.map((effect) => {
          const element = elementById(effect.target);
          if (!element) return null;
          const box = geometry(element, w, h)!;
          return (
            <div
              key={effect.id}
              className="absolute max-h-32 w-64 max-w-[85%] overflow-y-auto"
              style={{
                left: Math.min(viewportStyles.left + (box.x + box.w / 2) / 100 * w * scale, Math.max(8, w * scale + viewportStyles.left - 256)),
                top: Math.max(0, Math.min(viewportStyles.top + (box.y + box.h) / 100 * h * scale, viewportStyles.top + h * scale - 95)),
              }}
            >
              <TeachingFeedback effects={[effect]} targetId={effect.target} />
            </div>
          );
        })}
      </div>

      {/* z103 全画布教学反馈与未命中提示 */}
      <div className="absolute left-3 right-3 top-3 z-[103] flex flex-col gap-1">
        <TeachingFeedback effects={effects} />
        {unlocated.length > 0 && (
          <p role="status" className="rounded border bg-background p-2 text-sm">
            教学效果未找到对应元素，其他内容仍可观看。
          </p>
        )}
      </div>
    </div>
  );
}