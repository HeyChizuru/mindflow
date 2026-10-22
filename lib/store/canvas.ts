import { create } from 'zustand';
import { createSelectors } from '@/lib/utils/create-selectors';
import type { PercentageGeometry } from '@/lib/types/action';

export interface SpotlightOptions {
  radius?: number;
  dimness?: number;
  transition?: number;
}

export interface HighlightOverlayOptions {
  color?: string;
  opacity?: number;
  borderWidth?: number;
  animated?: boolean;
}

export interface LaserOptions {
  color?: string;
  duration?: number;
}

interface CanvasState {
  canvasScale: number;
  canvasPercentage: number;
  viewportSize: number;
  viewportRatio: number;

  spotlightElementId: string;
  spotlightOptions: SpotlightOptions | null;
  spotlightMode: 'pixel' | 'percentage';
  spotlightPercentageGeometry: PercentageGeometry | null;
  highlightedElementIds: string[];
  highlightOptions: HighlightOverlayOptions | null;
  laserElementId: string;
  laserOptions: LaserOptions | null;
  zoomTarget: { elementId: string; scale: number } | null;

  setCanvasScale: (scale: number) => void;
  setCanvasPercentage: (percentage: number) => void;
  setViewportSize: (size: number) => void;
  setViewportRatio: (ratio: number) => void;

  setSpotlight: (elementId: string, options?: SpotlightOptions) => void;
  clearSpotlight: () => void;
  setSpotlightPercentage: (
    elementId: string,
    geometry: PercentageGeometry,
    options?: SpotlightOptions,
  ) => void;
  setHighlight: (elementIds: string[], options?: HighlightOverlayOptions) => void;
  clearHighlight: () => void;
  setLaser: (elementId: string, options?: LaserOptions) => void;
  clearLaser: () => void;
  setZoom: (elementId: string, scale: number) => void;
  clearZoom: () => void;
  clearAllEffects: () => void;
}

const initialState = {
  canvasScale: 1,
  canvasPercentage: 90,
  viewportSize: 1000,
  viewportRatio: 0.5625,

  spotlightElementId: '',
  spotlightOptions: null,
  spotlightMode: 'pixel' as const,
  spotlightPercentageGeometry: null,
  highlightedElementIds: [],
  highlightOptions: null,
  laserElementId: '',
  laserOptions: null,
  zoomTarget: null,
};

const useCanvasStoreBase = create<CanvasState>()((set) => ({
  ...initialState,

  setCanvasScale: (canvasScale) => set({ canvasScale }),
  setCanvasPercentage: (canvasPercentage) => set({ canvasPercentage }),
  setViewportSize: (viewportSize) => set({ viewportSize }),
  setViewportRatio: (viewportRatio) => set({ viewportRatio }),

  setSpotlight: (elementId, options = {}) =>
    set({
      spotlightElementId: elementId,
      spotlightMode: 'pixel',
      spotlightOptions: {
        radius: 200,
        dimness: 0.7,
        transition: 300,
        ...options,
      },
      spotlightPercentageGeometry: null,
    }),

  clearSpotlight: () =>
    set({
      spotlightElementId: '',
      spotlightOptions: null,
      spotlightMode: 'pixel',
      spotlightPercentageGeometry: null,
    }),

  setSpotlightPercentage: (elementId, geometry, options = {}) =>
    set({
      spotlightElementId: elementId,
      spotlightMode: 'percentage',
      spotlightPercentageGeometry: geometry,
      spotlightOptions: {
        dimness: 0.7,
        transition: 300,
        ...options,
      },
    }),

  setHighlight: (elementIds, options = {}) =>
    set({
      highlightedElementIds: elementIds,
      highlightOptions: {
        color: '#ff6b6b',
        opacity: 0.3,
        borderWidth: 3,
        animated: true,
        ...options,
      },
    }),

  clearHighlight: () => set({ highlightedElementIds: [], highlightOptions: null }),

  setLaser: (elementId, options = {}) =>
    set({
      laserElementId: elementId,
      laserOptions: {
        color: '#ff0000',
        duration: 3000,
        ...options,
      },
    }),

  clearLaser: () => set({ laserElementId: '', laserOptions: null }),
  setZoom: (elementId, scale) => set({ zoomTarget: { elementId, scale } }),
  clearZoom: () => set({ zoomTarget: null }),

  clearAllEffects: () =>
    set({
      spotlightElementId: '',
      spotlightOptions: null,
      spotlightMode: 'pixel',
      spotlightPercentageGeometry: null,
      highlightedElementIds: [],
      highlightOptions: null,
      laserElementId: '',
      laserOptions: null,
      zoomTarget: null,
    }),
}));

export const useCanvasStore = createSelectors(useCanvasStoreBase);
