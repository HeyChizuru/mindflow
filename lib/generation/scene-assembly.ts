import { nanoid } from 'nanoid';
import type { Action } from '@/lib/types/action';
import type { SceneOutline } from '@/lib/types/outline';
import type {
  CreateSceneInput,
  GeneratedSlideContent,
  GeneratedQuizContent,
  SlideTheme,
} from '@/lib/types/scene';
import { createSceneSchema } from '@/lib/validators/scenes';

/** Pure assembly: scene IDs and timestamps belong to the database. */
export function buildCompleteScene(
  outline: SceneOutline,
  content: GeneratedSlideContent | GeneratedQuizContent,
  actions: Action[],
  stageId: string,
): CreateSceneInput | null {
  const base = {
    stageId,
    outlineId: outline.id,
    type: outline.type,
    title: outline.title,
    order: outline.order,
    actions,
  };

  let candidate: CreateSceneInput;
  if (outline.type === 'slide' && 'elements' in content) {
    const theme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };
    candidate = {
      ...base,
      content: {
        type: 'slide',
        canvas: {
          id: nanoid(),
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme,
          elements: content.elements,
          ...(content.background ? { background: content.background } : {}),
        },
      },
    };
  } else if (outline.type === 'quiz' && 'questions' in content) {
    candidate = { ...base, content: { type: 'quiz', questions: content.questions } };
  } else {
    return null;
  }

  const result = createSceneSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
