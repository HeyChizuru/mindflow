'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStageStore } from '@/lib/store';
import { isCurrentSceneEditable } from '@/lib/edit/stage-mode';
import { isMaicEditorEnabled } from '@/lib/config/feature-flags';
import { EditChromeRoot } from '@/components/edit/EditChromeRoot';
import {
  PlaybackChromeRoot, type PlaybackChromeRootHandle
} from '@/components/edit/PlaybackChromeRoot';
import { useEditModeLock } from '@/components/edit/use-edit-mode-lock';
import { MultiTabEditConflictPrompt } from '@/components/edit/MultiTabEditConflictPrompt';
import { InteractiveIframeHost } from '@/components/scene-renderers/InteractiveIframeHost';
import { CHROME_EASE } from '@/lib/edit/transitions';
import { preloadEditor } from '@/lib/edit/preload-editor';

/**
 * Stage — top-level classroom container. Dispatches between the two
 * chrome roots based on `useStageStore.mode`:
 *
 *   mode === 'edit'                → EditChromeRoot
 *   mode === 'playback' / 'autonomous' → PlaybackChromeRoot
 *
 * The two roots are wholly independent. Stage's only responsibilities
 * are: mode dispatch, edit-lock coordination (cross-tab), Pro Switch
 * toggle wiring (calls into PlaybackChromeRoot.teardown via ref before
 * flipping mode), and rendering the cross-tab conflict prompt (which
 * needs to be mountable from playback mode too, since the lock-conflict
 * dialog can surface when Pro Switch is clicked but acquire fails).
 *
 * Stage — 课堂顶层容器。根据 `useStageStore.mode` 在两种 chrome 根组件间分发：
 *
 *   mode === 'edit'                → EditChromeRoot
 *   mode === 'playback' / 'autonomous' → PlaybackChromeRoot
 *
 * 两个根组件完全独立。Stage 仅负责：模式分发、编辑锁协调（跨标签页）、
 * Pro Switch 切换接线（切换模式前通过 ref 调用 PlaybackChromeRoot.teardown）、
 * 以及渲染跨标签页冲突提示（播放模式下也需可挂载，因 Pro Switch 点击后
 * 获取锁失败时可能弹出锁冲突对话框）。
 */
export function Stage({
  onRetryOutline,
}: {
  onRetryOutline?: (outlineId: string) => Promise<void>;
}) {
  const { mode, setMode, scenes, currentSceneId, generatingOutlines, stage } = useStageStore();
  const currentScene = useStageStore((s) => s.getCurrentScene());

  // Predicate for "can the user enter Pro mode for the current scene?".
  // Single source of truth feeds the Header's Pro Switch state and the
  // auto-exit effect below; keeping them in lock-step prevents an
  // edit-mode entry that would immediately auto-exit.
  // 判断「当前场景是否可进入 Pro 模式」。
  // 作为单一数据源驱动 Header 的 Pro Switch 状态与下方自动退出逻辑；
  // 保持同步可避免进入编辑模式后立即被自动退出。
  const isEditable = isCurrentSceneEditable({
    currentSceneId,
    sceneCount: scenes.length,
    generatingOutlineCount: generatingOutlines.length,
    hasCurrentScene: !!currentScene,
  });

  // Cross-tab edit lock (#571). Lives at this layer because entry must
  // be refused BEFORE the live session is torn down; PlaybackChromeRoot
  // can't own this since it can't refuse its own unmount path.
  // 跨标签页编辑锁（#571）。放在此层是因为必须在实时会话拆除前拒绝进入；
  // PlaybackChromeRoot 无法持有，因其无法拒绝自身卸载路径。
  const editLock = useEditModeLock(stage?.id);

  const playbackRef = useRef<PlaybackChromeRootHandle>(null);

  // Pro Switch handler. Edit→playback is a plain flip (PlaybackChromeRoot
  // will mount fresh; its engine effect re-inits). Playback→edit must
  // (1) refuse on lock conflict, (2) await SSE / engine / TTS teardown
  // so PlaybackChromeRoot is quiescent before it unmounts.
  // Pro Switch 处理器。编辑→播放为直接切换（PlaybackChromeRoot 重新挂载，引擎 effect 重新初始化）。
  // 播放→编辑须 (1) 锁冲突时拒绝，(2) 等待 SSE / 引擎 / TTS 拆除完成，
  // 使 PlaybackChromeRoot 在卸载前进入静默状态。
  const handleToggleEditMode = useCallback(async () => {
    if (mode === 'edit') {
      setMode('playback');
      return;
    }
    if (!editLock.acquire()) return;
    // Load the editor chunk (fonts + slide surface) BEFORE flipping mode,
    // so the edit chrome animates in with its content already present and
    // the slide surface registered — no mid-animation pop-in / NOOP flash.
    // Runs concurrently with teardown; the import is promise-cached so it's
    // a no-op on subsequent toggles.
    // 切换模式前先加载编辑器 chunk（字体 + 幻灯片表面），使编辑 chrome 入场时
    // 内容已就绪且幻灯片表面已注册 — 避免动画中途弹出 / NOOP 闪烁。
    // 与拆除并行执行；import 已 promise 缓存，后续切换为 no-op。
    const editorLoad = preloadEditor();
    try {
      await Promise.all([playbackRef.current?.teardown(), editorLoad]);
    } catch (err) {
      // Teardown failed after the cross-tab lock was acquired but before we
      // flipped into edit mode. Release the lock we just took: otherwise it
      // stays HELD while mode stays 'playback', and the release effect (keyed
      // on `mode`) never re-fires, stranding the lock until tab close and
      // blocking this and every other tab from Pro mode. Stay in playback so
      // the failure surfaces rather than half-entering edit mode.
      // 获取跨标签页锁后、切换编辑模式前拆除失败。须释放刚获取的锁：否则 mode 仍为
      // 'playback' 时锁保持 HELD，而 release effect（依赖 `mode`）不会再次触发，
      // 锁将滞留至标签页关闭，阻塞本标签及其他标签进入 Pro 模式。保持播放模式以暴露错误，
      // 而非半进入编辑模式。
      editLock.release();
      console.error('[Stage] Pro mode entry failed during teardown', err);
      return;
    }
    setMode('edit');
  }, [editLock, mode, setMode]);

  // Auto-exit edit mode when the current scene becomes uneditable
  // (pending generation, no scenes, currently generating).
  // 当前场景变为不可编辑时自动退出编辑模式（待生成、无场景、正在生成中）。
  useEffect(() => {
    if (mode === 'edit' && !isEditable) {
      setMode('playback');
    }
  }, [mode, isEditable, setMode]);

  // Release the lock whenever we're not in edit mode (covers manual
  // exit, auto-exit, scene becomes uneditable). The hook also self-
  // releases on unmount / tab close.
  // 非编辑模式时释放锁（涵盖手动退出、自动退出、场景变为不可编辑）。
  // hook 在卸载 / 标签页关闭时也会自行释放。
  const releaseEditLock = editLock.release;
  useEffect(() => {
    if (mode !== 'edit') releaseEditLock();
  }, [mode, releaseEditLock]);

  const toggleHandler = isMaicEditorEnabled() ? handleToggleEditMode : undefined;

  // Mode swap choreography — a clean opacity cross-fade. Both roots layer
  // via `absolute inset-0` so they coexist for the ~280ms window without
  // one popping out before the other arrives. The outgoing root keeps
  // rendering its canvas during exit so `canvasStore` (the shared scale
  // writer) doesn't briefly read zero.
  //
  // Deliberately NO transform (translateY) on these layers: the edit
  // chrome hosts the Pro Switch / settings pill, which morph across the
  // swap via `layoutId`. A transform on this ancestor distorts motion's
  // layout measurement (the pill visibly drifts) and the blurred chrome
  // would repaint its backdrop-filter every frame while translating. A
  // pure fade keeps layout static so the shared elements land precisely.
  // 模式切换编排 — 干净的透明度交叉淡入淡出。两棵根通过 `absolute inset-0` 叠层，
  // 在约 280ms 内共存，避免一方先消失。退出方在离场期间继续渲染 canvas，
  // 使 `canvasStore`（共享缩放写入器）不会短暂读到零。
  //
  // 刻意不在这些层上使用 transform（translateY）：编辑 chrome 承载 Pro Switch /
  // 设置胶囊，通过 `layoutId` 在切换间变形。祖先上的 transform 会扭曲 motion 的
  // 布局测量（胶囊明显漂移），模糊 chrome 在位移时每帧重绘 backdrop-filter。
  // 纯淡入淡出保持布局静止，共享元素可精准落位。
  return (
    <div className="relative flex flex-1 overflow-hidden">
      <AnimatePresence initial={false}>
        {mode === 'edit' && currentScene ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: CHROME_EASE }}
            className="absolute inset-0 flex"
          >
            <EditChromeRoot
              scene={currentScene}
              isEditable={isEditable}
              onToggleEditMode={toggleHandler}
            />
          </motion.div>
        ) : (
          <motion.div
            key="playback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: CHROME_EASE }}
            className="absolute inset-0 flex"
          >
            <PlaybackChromeRoot
              ref={playbackRef}
              onRetryOutline={onRetryOutline}
              canEnterProMode={isEditable}
              onEnterProMode={toggleHandler}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <MultiTabEditConflictPrompt
        open={editLock.conflictOpen}
        onDismiss={editLock.dismissConflict}
      />
      {/* Keep-alive host for interactive scene iframes (#619). Lives here, above
          the mode-swap subtree, so its iframes survive Pro mode toggles and
          scene switches instead of reloading on every remount.
          交互式场景 iframe 的保活宿主（#619）。置于模式切换子树之上，
          使 iframe 在 Pro 模式切换与场景切换时得以保留，而非每次重挂载都重载。 */}
      <InteractiveIframeHost />
    </div>
  );
}
