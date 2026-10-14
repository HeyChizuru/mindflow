import { FileText } from 'lucide-react';

export type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'writing' | 'visual';
};

/** 本单元只点亮大纲一步。幻灯片内容与动作的步骤不在这里切换。 */
export const ALL_STEPS: GenerationStep[] = [
  {
    id: 'outline',
    title: 'generation.generatingOutlines',
    description: 'generation.generatingOutlinesDesc',
    icon: FileText,
    type: 'writing',
  },
];
