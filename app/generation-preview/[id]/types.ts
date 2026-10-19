import { Clapperboard, FileText, LayoutPanelLeft } from 'lucide-react';

export type FirstScenePhase =
  | { step: 'reading' }
  | { step: 'slide-content' }
  | { step: 'actions' }
  | { step: 'complete' }
  | { step: 'error'; failedStep: 'reading' | 'slide-content' | 'actions'; message?: string };

export type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'writing' | 'visual';
};

/** 首屏展示步骤，由真实请求结果推进。 */
export const ALL_STEPS: GenerationStep[] = [
  {
    id: 'outline',
    title: 'generation.generatingOutlines',
    description: 'generation.generatingOutlinesDesc',
    icon: FileText,
    type: 'writing',
  },
  {
    id: 'slide-content',
    title: 'generation.generatingFirstContent',
    description: 'generation.generatingFirstContentDesc',
    icon: LayoutPanelLeft,
    type: 'visual',
  },
  {
    id: 'actions',
    title: 'generation.generatingFirstActions',
    description: 'generation.generatingFirstActionsDesc',
    icon: Clapperboard,
    type: 'visual',
  },
];
