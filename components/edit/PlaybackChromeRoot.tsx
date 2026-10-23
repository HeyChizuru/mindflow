'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClassroomView } from '@/components/stage/classroom-view';
import type { PlaybackDisplay, TeachingEffect } from '@/components/stage/classroom-view-types';
import { useClassroom } from '@/lib/hooks/use-classroom';
import { PlaybackEngine } from '@/lib/playback';
import { ActionEngine } from '@/lib/action/engine';

type PlayingState = { sceneId: string; run: number; phase: PlaybackDisplay; subtitle: string | null;
  discussion: { topic: string; prompt: string } | null; effects: TeachingEffect[]; actionNotice: string | null };

export function PlaybackChromeRoot({ stageId }: { stageId: string }) {
  const { session, state } = useClassroom(stageId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [playing, setPlaying] = useState<PlayingState | null>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const data = state.classroom;
  const scene = data?.scenes.find((item) => item.id === state.sceneId) ?? null;

  useEffect(() => {
    if (!scene) return;
    let active = true;
    const run = state.playbackRun, sceneId = scene.id;
    const update = (patch: Partial<PlayingState>) => {
      if (!active) return;
      setPlaying((current) => ({
        ...(current?.sceneId === sceneId && current.run === run ? current :
          { sceneId, run, phase: 'idle' as const, subtitle: null, discussion: null, effects: [], actionNotice: null }),
        ...patch,
      }));
    };
    const engine = new PlaybackEngine(scene, new ActionEngine((effects) => update({ effects }), scene), {
      onModeChange: (mode) => update({ phase: mode }),
      onSpeechStart: (text) => update({ subtitle: text, phase: 'playing' }),
      onProactiveShow: (trigger) => update({ discussion: { topic: trigger.question, prompt: trigger.prompt }, phase: 'discussion' }),
      onProactiveHide: () => update({ discussion: null }),
      onActionUnavailable: (_action, message) => update({ actionNotice: message }),
      onComplete: () => update({ phase: 'ended' }),
    });
    engineRef.current = engine;
    engine.start();
    return () => { active = false; engine.stop(); if (engineRef.current === engine) engineRef.current = null; };
  }, [scene, state.playbackRun]);

  const current = playing && playing.sceneId === scene?.id && playing.run === state.playbackRun ? playing : null;
  const playPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getMode() === 'playing') engine.pause();
    else if (engine.getMode() === 'paused') { engine.skipDiscussion(); engine.resume(); }
    else session.replay();
  }, [session]);
  const directory = data?.directory ?? [];
  const index = directory.findIndex((item) => item.sceneId !== null && item.sceneId === scene?.id);
  const select = useCallback((id: string | null) => {
    session.selectScene(id);
    if (id && window.matchMedia('(max-width: 767px)').matches) setSidebarCollapsed(true);
  }, [session]);
  const next = useCallback(() => {
    const entries = session.getSnapshot().classroom?.directory ?? [];
    const currentIndex = entries.findIndex((item) => item.sceneId === session.getSnapshot().sceneId);
    if (currentIndex >= 0 && currentIndex < entries.length - 1) select(entries[currentIndex + 1].sceneId);
  }, [select, session]);
  const previous = useCallback(() => {
    const entries = session.getSnapshot().classroom?.directory ?? [];
    const currentIndex = entries.findIndex((item) => item.sceneId === session.getSnapshot().sceneId);
    if (currentIndex > 0) select(entries[currentIndex - 1].sceneId);
  }, [select, session]);
  useEffect(() => {
    const fullscreen = () => setIsPresenting(document.fullscreenElement === stageRef.current);
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        event.target instanceof HTMLElement && event.target.closest('input,textarea,select,button,a,[role=radio],[role=checkbox],[contenteditable=true]')) return;
      if (event.code === 'Space') { event.preventDefault(); playPause(); }
      else if (event.key === 'ArrowLeft') previous();
      else if (event.key === 'ArrowRight') next();
    };
    document.addEventListener('fullscreenchange', fullscreen);
    window.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('fullscreenchange', fullscreen); window.removeEventListener('keydown', keydown); };
  }, [playPause, next, previous]);
  const sessionNotice = state.positionNotice ?? state.notice;
  const notice = sessionNotice ? {
    ...sessionNotice,
    actionLabel: sessionNotice.action === 'position' ? '读取确认后重试保存' : sessionNotice.action === 'read' ? '重新读取' : undefined,
    onAction: sessionNotice.action === 'position' ? () => { void session.retryPosition(); }
      : sessionNotice.action === 'read' ? () => { void session.refresh(); } : undefined,
  } : current?.actionNotice ? { title: '播放提示', message: current.actionNotice } : null;
  const quizQuestions = scene?.content.type === 'quiz' ? scene.content.questions : [];
  const ungraded = data?.scenes.flatMap((item) => item.content.type === 'quiz' ? item.content.questions.flatMap((question) => {
    const record = state.questions[session.key(item.id, question.id)]?.record;
    return record && record.status !== 'completed' ? [{ sceneId: item.id, questionId: question.id, label: item.title + ' · ' + question.question }] : [];
  }) : []) ?? [];
  return <div ref={stageRef} className="flex h-full min-h-0 flex-1 flex-col">
    <ClassroomView directory={directory} scene={scene} pageState={state.page} generationUrl={state.generationUrl}
      playback={current?.phase ?? 'idle'} subtitle={current?.subtitle} discussion={current?.discussion} effects={current?.effects ?? []}
      sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      onSceneSelect={select} onRead={() => { void session.refresh(); }} notice={notice}
      allScenesReady={data?.allScenesReady} ungraded={ungraded}
      onLocateQuestion={(id, questionId) => {
        select(id);
        requestAnimationFrame(() => {
          const element = document.getElementById('question-' + encodeURIComponent(session.stageId + '/' + id + '/' + questionId));
          element?.scrollIntoView({ block: 'center' }); element?.focus();
        });
      }}
      onPlayPause={scene ? playPause : undefined} onContinue={() => engineRef.current?.skipDiscussion()}
      onNextSegment={current?.phase !== 'ended' && !current?.discussion && scene ? () => engineRef.current?.nextSegment() : undefined}
      onReplay={scene ? session.replay : undefined}
      onPrevious={index > 0 ? previous : undefined} onNext={index >= 0 && index < directory.length - 1 ? next : undefined}
      isPresenting={isPresenting} onFullscreen={async () => {
        try { if (document.fullscreenElement === stageRef.current) await document.exitFullscreen(); else await stageRef.current?.requestFullscreen(); }
        catch { setPlaying((value) => value ? { ...value, actionNotice: '浏览器未允许全屏，可继续在当前窗口观看。' } : value); }
      }}
      quiz={{
        questions: Object.fromEntries(quizQuestions.map((question) => [question.id, state.questions[session.key(scene!.id, question.id)] ?? {}])),
        onChange: (id, answer) => { if (scene) session.changeAnswer(scene.id, id, answer); },
        onSubmit: (id) => { if (scene) void session.submit(scene.id, id); },
        onRedo: (id) => { if (scene) session.redo(scene.id, id); },
        onCancel: (id) => { if (scene) session.cancelRedo(scene.id, id); },
        onRetry: (id) => { if (scene) void session.retryGrading(scene.id, id); },
        onRead: (id) => { if (scene) void session.readLatest(scene.id, id); },
        onSkip: next,
      }} />
  </div>;
}
