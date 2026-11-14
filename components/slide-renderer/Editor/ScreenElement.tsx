'use client';

import { Component, type ReactNode } from 'react';
import type { SceneContent, SlideElement } from '@/lib/types/scene';
import type { ChartData, ChartType, LinePoint } from '@/lib/types/slides';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { BaseTextElement } from '../components/element/TextElement/BaseTextElement';
import { BaseShapeElement } from '../components/element/ShapeElement/BaseShapeElement';
import { BaseLineElement } from '../components/element/LineElement/BaseLineElement';
import { BaseChartElement } from '../components/element/ChartElement/BaseChartElement';
import { BaseLatexElement } from '../components/element/LatexElement/BaseLatexElement';

// 单个元素渲染失败时只替换该元素，其他画布内容仍可展示。
class ElementBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function chartData(value: Record<string, unknown>): ChartData | null {
  const { labels, legends, series } = value;
  if (!Array.isArray(labels) || !labels.every((v) => typeof v === 'string') ||
    !Array.isArray(legends) || !legends.every((v) => typeof v === 'string') ||
    !Array.isArray(series) || series.length === 0 || !series.every((row) => Array.isArray(row) && row.length > 0 && row.every((n) => typeof n === 'number' && Number.isFinite(n)))) return null;
  return { labels, legends, series };
}
function isChartType(value: string): value is ChartType { return ['bar', 'column', 'line', 'pie', 'ring', 'area', 'radar', 'scatter'].includes(value); }
function isPoint(value: string): value is LinePoint { return ['', 'arrow', 'dot'].includes(value); }

export function ScreenElement({ elementInfo, elementIndex, animate }: { elementInfo: SlideElement; elementIndex: number; animate?: boolean }) {
  const theme = useSceneSelector<SceneContent, { fontColor: string; fontName: string }>((content) => content.type === 'slide' ? content.canvas.theme : { fontColor: '#333', fontName: 'sans-serif' });
  const unavailable = (message: string) => <div role="status" className="element-content absolute overflow-hidden border border-dashed text-sm"
    style={{ left: elementInfo.left, top: elementInfo.top, width: elementInfo.width, height: elementInfo.height, transform: 'rotate(' + (elementInfo.rotate ?? 0) + 'deg)' }}>{message}</div>;
  function renderElement(): ReactNode {
    const rotate = elementInfo.rotate ?? 0;
    // 按结构化元素类型选择对应的只读渲染组件。
    switch (elementInfo.type) {
      case 'text': return <BaseTextElement elementInfo={{ ...elementInfo, rotate }} />;
      case 'shape': {
        const box = typeof elementInfo.viewBox === 'string' ? elementInfo.viewBox.trim().split(/[\s,]+/).map(Number) : elementInfo.viewBox;
        const viewBox: [number, number] = box.length === 4 ? [box[2], box[3]] : [box[0], box[1]];
        if (box.some((n) => !Number.isFinite(n)) || ![2, 4].includes(box.length) || viewBox.some((n) => n <= 0)) return unavailable('形状坐标无效');
        return <BaseShapeElement elementInfo={{ ...elementInfo, rotate, viewBox }} viewBoxOrigin={box.length === 4 ? [box[0], box[1]] : [0, 0]} />;
      }
      case 'line':
        if (!['solid', 'dashed', 'dotted'].includes(elementInfo.style) || !isPoint(elementInfo.points[0]) || !isPoint(elementInfo.points[1])) return unavailable('线条样式暂无法显示');
        return <BaseLineElement elementInfo={{ ...elementInfo, style: elementInfo.style as 'solid' | 'dashed' | 'dotted', points: [elementInfo.points[0], elementInfo.points[1]] }} animate={animate} />;
      case 'chart': {
        const data = chartData(elementInfo.data);
        if (!data || !isChartType(elementInfo.chartType)) return unavailable('图表格式暂无法显示');
        return <BaseChartElement elementInfo={{ ...elementInfo, rotate, data, chartType: elementInfo.chartType }} />;
      }
      case 'latex': return <BaseLatexElement elementInfo={{ ...elementInfo, rotate }} />;
      case 'image': return unavailable('图片暂无法显示');
      case 'video': return unavailable('暂不支持视频播放');
      default: return unavailable('暂不支持此元素');
    }
  }
  return <div className="screen-element pointer-events-none absolute inset-0" id={'screen-element-' + elementInfo.id} style={{ zIndex: elementIndex, color: theme.fontColor, fontFamily: theme.fontName }}>
    <ElementBoundary key={JSON.stringify(elementInfo)} fallback={unavailable('此元素暂无法显示，其他内容仍可观看')}>{renderElement()}</ElementBoundary>
  </div>;
}
