'use client';

import type { ReactNode } from 'react';
import type { SceneContent, SlideElement } from '@/lib/types/scene';
import type { ChartData, ChartType, LinePoint } from '@/lib/types/slides';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { BaseTextElement } from '../components/element/TextElement/BaseTextElement';
import { BaseShapeElement } from '../components/element/ShapeElement/BaseShapeElement';
import { BaseLineElement } from '../components/element/LineElement/BaseLineElement';
import { BaseChartElement } from '../components/element/ChartElement/BaseChartElement';
import { BaseLatexElement } from '../components/element/LatexElement/BaseLatexElement';

interface ScreenElementProps {
  readonly elementInfo: SlideElement;
  readonly elementIndex: number;
  readonly animate?: boolean;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readChartData(value: Record<string, unknown>): ChartData | null {
  const { labels, legends, series } = value;
  if (!isStringArray(labels) || !isStringArray(legends) || !Array.isArray(series)) return null;
  if (!series.every((row): row is number[] =>
    Array.isArray(row) && row.every((item) => typeof item === 'number' && Number.isFinite(item)))) {
    return null;
  }
  return { labels, legends, series };
}

function isChartType(value: string): value is ChartType {
  return ['bar', 'column', 'line', 'pie', 'ring', 'area', 'radar', 'scatter'].includes(value);
}

function isLinePoint(value: string): value is LinePoint {
  return value === '' || value === 'arrow' || value === 'dot';
}

export function ScreenElement({ elementInfo, elementIndex, animate }: ScreenElementProps) {
  const theme = useSceneSelector<SceneContent, { fontColor: string; fontName: string }>(
    (content) => content.type === 'slide'
      ? content.canvas.theme
      : { fontColor: '#333333', fontName: 'Microsoft YaHei' },
  );

  // The placeholder occupies only this element's saved bounds and stays transparent.
  const unavailable = (message: string) => (
    <div
      role="status"
      className="element-content absolute overflow-hidden border border-dashed border-current text-sm text-muted-foreground"
      style={{
        left: elementInfo.left,
        top: elementInfo.top,
        width: elementInfo.width,
        height: elementInfo.height,
        transform: `rotate(${elementInfo.rotate ?? 0}deg)`,
      }}
    >
      {message}
    </div>
  );

  const renderElement = (): ReactNode => {
    const rotate = elementInfo.rotate ?? 0;
    switch (elementInfo.type) {
      case 'text':
        return <BaseTextElement elementInfo={{ ...elementInfo, rotate }} />;
      case 'shape': {
        const viewBox = elementInfo.viewBox;
        if (typeof viewBox === 'string') return unavailable('此形状的坐标格式暂无法显示');
        return <BaseShapeElement elementInfo={{ ...elementInfo, rotate, viewBox }} />;
      }
      case 'line': {
        const { style, points } = elementInfo;
        if ((style !== 'solid' && style !== 'dashed' && style !== 'dotted') ||
            !isLinePoint(points[0]) || !isLinePoint(points[1])) {
          return unavailable('此线条的样式暂无法显示');
        }
        return (
          <BaseLineElement
            elementInfo={{ ...elementInfo, style, points: [points[0], points[1]] }}
            animate={animate}
          />
        );
      }
      case 'chart': {
        const data = readChartData(elementInfo.data);
        const chartType = elementInfo.chartType;
        if (!data || !isChartType(chartType)) return unavailable('此图表的格式暂无法显示');
        return <BaseChartElement elementInfo={{ ...elementInfo, rotate, data, chartType }} />;
      }
      case 'latex':
        return <BaseLatexElement elementInfo={{ ...elementInfo, rotate }} />;
      case 'image':
        return unavailable('图片暂无法显示');
      case 'video':
        return unavailable('暂不支持视频播放');
      default:
        return unavailable('暂不支持此元素');
    }
  };

  return (
    <div
      className="screen-element absolute inset-0 pointer-events-none"
      id={`screen-element-${elementInfo.id}`}
      style={{ zIndex: elementIndex, color: theme.fontColor, fontFamily: theme.fontName }}
    >
      {renderElement()}
    </div>
  );
}
