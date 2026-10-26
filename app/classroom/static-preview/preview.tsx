'use client';

import { useRef, useState, useEffect } from 'react';
import { useTheme } from '@/lib/hooks/use-theme';
import { ClassroomView } from '@/components/stage/classroom-view';
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import type { ClassroomNotice, PageState, PlaybackDisplay, QuestionDisplay } from '@/components/stage/classroom-view-types';
import type { QuizFailureCode } from '@/lib/types/classroom';
import { STAGE_ID, QUIZ_ID, END_ID, slide, tallSlide, unsafeSlide, quizScene, closingScene, directory, questions, sampleRecord, sampleEffects, effectOptions } from './fixtures';

const pageOptions: [PageState, string][] = [['ready', '可播放'], ['loading', '读取中'], ['draft', '草稿课堂'], ['first_scene_pending', '首场未就绪'], ['not_found', '课堂不存在'], ['invalid_address', '无效地址'], ['read_failed', '读取失败']];
const playbackOptions: [PlaybackDisplay, string][] = [['idle', '尚未开始'], ['playing', '讲解中'], ['paused', '暂停'], ['ended', '本场结束']];
const quizModes = ['unsubmitted', 'completed', 'incorrect', 'pending', 'processing', 'failed', 'expired', 'redo', 'submitting', 'unsaved', 'unknown', 'conflict', 'MODEL_CONFIG_REQUIRED', 'INVALID_MODEL_RESULT', 'GRADING_TIMEOUT', 'RESULT_SAVE_FAILED'] as const;
type QuizMode = typeof quizModes[number];
const quizLabels = ['未提交', '已完成示例', '选择题错误示例', '简答待批改', '简答批改中', '简答批改失败', '简答执行过期', '主动重做', '提交中', '答案未保存', '保存待确认', '版本冲突', '缺模型配置', '批改输出无效', '批改超时', '结果保存失败'];
const effectsLabels = ['无效果', '聚焦', '激光', '组件高亮', '教学标注', '状态提示', '目标不存在', '不可解释状态'];
function PreviewSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <Field><FieldLabel>{label}
    <select className="h-8 min-w-0 w-full rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select>
  </FieldLabel></Field>;
}
export function StaticClassroomPreview() {
  const [pageState, setPageState] = useState<PageState>('ready');
  const [playback, setPlayback] = useState<PlaybackDisplay>('playing');
  const [sceneId, setSceneId] = useState(slide.id);
  const [variant, setVariant] = useState('wide');
  const [effect, setEffect] = useState<typeof effectOptions[number]>('none');
  const [quizMode, setQuizMode] = useState<QuizMode>('unsubmitted');
  const [overrides, setOverrides] = useState<Record<string, QuestionDisplay>>({});
  const [allReady, setAllReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [noticeChoice, setNoticeChoice] = useState('none');
  const [notice, setNotice] = useState<ClassroomNotice | null>(null);
  const [subtitle, setSubtitle] = useState('先观察数据，再把问题拆成可以验证的小步骤。每完成一个步骤，都留下一项可检查的结果。');
  const [isPresenting, setIsPresenting] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { setTheme } = useTheme();
  useEffect(() => {
    const change = () => setIsPresenting(document.fullscreenElement === surfaceRef.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  const scene = sceneId === QUIZ_ID ? quizScene : sceneId === END_ID ? closingScene : variant === 'tall' ? tallSlide : variant === 'unsafe' ? unsafeSlide : slide;
  const entries = directory.map((entry) => entry.outlineId === 'outline-3' && allReady ? { ...entry, ready: true, sceneId: END_ID } : entry);
  const sceneIndex = entries.findIndex((entry) => entry.sceneId === sceneId);
  const key = (id: string) => STAGE_ID + '/' + QUIZ_ID + '/' + id;
  function questionDisplay(id: string): QuestionDisplay {
    const question = questions.find((item) => item.id === id)!;
    let display: QuestionDisplay = {};
    if (['completed', 'redo'].includes(quizMode)) display = { record: sampleRecord(question, 'completed'), editing: quizMode === 'redo' };
    else if (quizMode === 'incorrect') {
      const record = sampleRecord(question, 'completed');
      display = { record: question.type === 'short_answer' ? record : {
        ...record, answer: question.type === 'single' ? { type: 'single', value: 'A' } : { type: 'multiple', values: ['A'] },
        result: { type: question.type, earned: 0, points: question.points, analysis: question.analysis, correct: false, correctAnswer: question.answer },
      } };
    }
    else if (['pending', 'processing', 'failed', 'expired'].includes(quizMode) && question.type === 'short_answer')
      display = { record: sampleRecord(question, quizMode === 'expired' ? 'processing' : quizMode as 'pending' | 'processing' | 'failed', quizMode === 'expired') };
    else if (['MODEL_CONFIG_REQUIRED', 'INVALID_MODEL_RESULT', 'GRADING_TIMEOUT', 'RESULT_SAVE_FAILED'].includes(quizMode) && question.type === 'short_answer')
      display = { record: { ...sampleRecord(question, 'failed'), failureCode: quizMode as QuizFailureCode } };
    else if (quizMode === 'submitting') display = { submitting: true, draft: sampleRecord(question, 'completed').answer };
    else if (['unsaved', 'unknown', 'conflict'].includes(quizMode)) display = {
      draft: sampleRecord(question, 'completed').answer,
      issue: quizMode as 'unsaved' | 'unknown' | 'conflict',
      ...(quizMode === 'conflict' ? { record: sampleRecord(question, 'completed') } : {}),
    };
    return { ...display, ...overrides[key(id)] };
  }
  function update(id: string, patch: QuestionDisplay) {
    setOverrides((current) => ({ ...current, [key(id)]: { ...questionDisplay(id), ...patch } }));
  }
  function selectScene(id: string | null) {
    if (!id) { setNotice({ title: '目标场景未就绪', message: '当前画面与输入保持不变。这里只演示重新读取入口。', actionLabel: '重新读取', onAction: () => setNotice({ title: '静态预览', message: '未发送请求。可通过“后续场景”选择就绪样例。' }) }); return; }
    setSceneId(id); setEffect('none'); setPlayback('playing'); setNotice(null);
  }
  function readRecord(id: string) {
    update(id, { record: sampleRecord(questions.find((question) => question.id === id)!, 'completed'), issue: undefined, editing: false, submitting: false });
    setNotice({ title: '已切换示例记录', message: '这是预先准备的已保存记录，没有进行读取或判分。' });
  }
  function noticeSample(value: string) {
    const notices: Record<string, ClassroomNotice | null> = {
      none: null,
      fallback: { title: '已回到首场', message: '上次保存的场景已不可用，从首场开头观看。' },
      saving: { title: '正在保存位置', message: '当前观看不受影响。' },
      save_failed: { title: '位置未保存', message: '当前内容仍可观看。', actionLabel: '重新读取后重试', onAction: () => setNotice({ title: '静态预览', message: '这里仅演示恢复入口，未发送请求。' }) },
      unknown: { title: '位置保存结果待确认', message: '请先重新读取，确认实际保存位置。', actionLabel: '重新读取', onAction: () => setNotice(null) },
      generation_failed: { title: '后续内容准备失败', message: '已经就绪的场景仍可观看。本页不执行生成重试。' },
    };
    setNoticeChoice(value);
    setNotice(notices[value]);
  }
  return <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <details open className="shrink-0 border-b bg-muted/30">
      <summary className="cursor-pointer px-4 py-2 text-sm font-semibold">静态演示，不保存或判分 · 展开／收起状态选择</summary>
      <div className="max-h-[25dvh] overflow-y-auto px-4 pb-3">
        <p className="mb-3 text-xs text-muted-foreground">提交只切到“提交中”；结果须手动切换预置样例，与输入正确与否无关。</p>
        <FieldGroup className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <PreviewSelect label="页面状态" value={pageState} options={pageOptions} onChange={(v) => setPageState(v as PageState)} />
          <PreviewSelect label="播放状态" value={playback} options={playbackOptions} onChange={(v) => setPlayback(v as PlaybackDisplay)} />
          <PreviewSelect label="内容样例" value={variant} options={[['wide', '16:9 五类元素'], ['tall', '4:3 画布'], ['unsafe', '受控 HTML 与异常元素']]} onChange={(v) => { setVariant(v); selectScene(slide.id); }} />
          <PreviewSelect label="教学效果" value={effect} options={effectOptions.map((mode, i) => [mode, effectsLabels[i]])} onChange={(v) => setEffect(v as typeof effect)} />
          <PreviewSelect label="测验状态" value={quizMode} options={quizModes.map((mode, i) => [mode, quizLabels[i]])} onChange={(v) => { setQuizMode(v as QuizMode); setOverrides({}); selectScene(QUIZ_ID); }} />
          <PreviewSelect label="后续场景" value={allReady ? 'ready' : 'pending'} options={[['pending', '末场未就绪'], ['ready', '全部就绪']]} onChange={(v) => { setAllReady(v === 'ready'); if (v !== 'ready' && sceneId === END_ID) selectScene(slide.id); }} />
          <PreviewSelect label="提示样例" value={noticeChoice} options={[ ['none', '无提示'], ['fallback', '位置失效回退'], ['saving', '位置保存中'], ['save_failed', '位置保存失败'], ['unknown', '保存结果待确认'], ['generation_failed', '续生成失败']]} onChange={noticeSample} />
          <Field><FieldLabel>主题与长字幕</FieldLabel><div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={() => setTheme('light')}>浅色</Button><Button size="sm" variant="outline" onClick={() => setTheme('dark')}>深色</Button>
            <Button size="sm" variant="outline" onClick={() => setSubtitle('把复杂问题拆成小步骤，每一步都写清行动和观察标准。'.repeat(20))}>长字幕</Button>
          </div></Field>
        </FieldGroup>
      </div>
    </details>
    <div ref={surfaceRef} className="flex min-h-0 flex-1 flex-col bg-background">
      <ClassroomView directory={entries} scene={scene} pageState={pageState} generationUrl={'/generation-preview/' + STAGE_ID}
        playback={playback} subtitle={subtitle} effects={sampleEffects(effect, scene.type === 'quiz')}
        notice={notice} allScenesReady={allReady}
        generation={allReady ? { phase: 'complete', target: null, failedStep: null, reason: null, error: null, recovery: null } : undefined}
        sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        onSceneSelect={selectScene} onRead={() => setPageState('ready')}
        onPlayPause={() => setPlayback((v) => v === 'playing' ? 'paused' : 'playing')}
        onNextSegment={() => setSubtitle('下一段样例：请用一个小练习检查理解，并记下仍不确定的地方。')}
        onReplay={() => { setPlayback('playing'); setEffect('none'); setSubtitle('从本场开头重新展示字幕，答题记录保持不变。'); }}
        onPrevious={sceneIndex > 0 ? () => selectScene(entries[sceneIndex - 1].sceneId) : undefined}
        onNext={sceneIndex >= 0 && sceneIndex < entries.length - 1 ? () => selectScene(entries[sceneIndex + 1].sceneId) : undefined}
        isPresenting={isPresenting} onFullscreen={async () => {
          try { if (document.fullscreenElement) await document.exitFullscreen(); else await surfaceRef.current?.requestFullscreen(); }
          catch { setNotice({ title: '无法进入全屏', message: '浏览器未允许全屏，仍可继续观看和作答。' }); }
        }}
        ungraded={quizMode === 'completed' ? [] : [{ sceneId: QUIZ_ID, questionId: 'short-1', label: '练习 · 简答题' }]}
        onLocateQuestion={(id, questionId) => {
          selectScene(id);
          requestAnimationFrame(() => {
            const node = document.getElementById('question-' + encodeURIComponent(STAGE_ID + '/' + id + '/' + questionId));
            node?.scrollIntoView({ block: 'center' }); node?.focus();
          });
        }}
        quiz={{
          questions: Object.fromEntries(questions.map((question) => [question.id, questionDisplay(question.id)])),
          onChange: (id, draft) => update(id, { draft, issue: undefined }),
          onSubmit: (id) => update(id, { submitting: true, issue: undefined }),
          onRedo: (id) => update(id, { editing: true, draft: undefined, issue: undefined }),
          onCancel: (id) => update(id, { editing: false, draft: undefined, issue: undefined }),
          onRetry: (id) => update(id, { record: sampleRecord(questions.find((question) => question.id === id)!, 'processing') }),
          onRead: readRecord,
          onSkip: () => { if (allReady) selectScene(END_ID); else setNotice({ title: '已跳过本场作答', message: '输入保持不变，可回看其他已就绪场景；下一场尚未就绪。' }); },
        }} />
    </div>
  </div>;
}
