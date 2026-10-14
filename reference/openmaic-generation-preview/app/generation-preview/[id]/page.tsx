'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles, AlertCircle, AlertTriangle, ArrowLeft, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OutlinesEditor } from '@/components/generation/outlines-editor';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { getEnabledProvidersWithVoices } from '@/lib/audio/voice-resolver';
import { isTTSProviderEnabled } from '@/lib/audio/provider-enablement';
import { getVoxCPMProviderOptions, useVoxCPMVoiceProfiles } from '@/lib/audio/voxcpm-voices';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  loadImageMapping,
  loadPdfBlob,
  cleanupOldImages,
  storeImages,
} from '@/lib/utils/image-storage';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { db } from '@/lib/utils/database';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { buildVideoManifestFromOutlines } from '@/lib/media/video-manifest';
import { nanoid } from 'nanoid';
import type { Stage } from '@/lib/types/stage';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { AgentRevealModal } from '@/components/agent/agent-reveal-modal';
import { createLogger } from '@/lib/logger';
import { type GenerationSessionState, ALL_STEPS, getActiveSteps } from './types';
import { StepVisualizer } from './components/visualizers';

const log = createLogger('GenerationPreview');

function GenerationPreviewContent() {
  const router = useRouter();
  const { t } = useI18n();
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const outlineReviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineReviewResolveRef = useRef<((outlines: SceneOutline[]) => void) | null>(null);
  // Sticky flag: true once the user signals review intent (either by clicking the
  // streaming card mid-stream, or by restoring a session that was already in review).
  // Combined with `reviewOutlineEnabled` to decide whether the post-stream timer fires.
  // 粘性标记：一旦用户表示审查意图（通过点击流式传输中的卡片，或恢复已处于审查状态的会话）即为 true。
  // 与 `reviewOutlineEnabled` 结合使用，决定流式传输后计时器是否触发。
  const outlineReviewIntentRef = useRef(false);
  const { profiles: voxcpmProfiles } = useVoxCPMVoiceProfiles();

  const [session, setSession] = useState<GenerationSessionState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);//当前步骤的索引
  const [isComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[] | null>(null);
  const [isOutlineStreaming, setIsOutlineStreaming] = useState(false);
  const [truncationWarnings, setTruncationWarnings] = useState<string[]>([]);
  const [webSearchSources, setWebSearchSources] = useState<Array<{ title: string; url: string }>>(
    [],
  );
  const [showAgentReveal, setShowAgentReveal] = useState(false);
  const [isConfirmingOutlines, setIsConfirmingOutlines] = useState(false);
  const [generatedAgents, setGeneratedAgents] = useState<
    Array<{
      id: string;
      name: string;
      role: string;
      persona: string;
      avatar: string;
      color: string;
      priority: number;
    }>
  >([]);
  const agentRevealResolveRef = useRef<(() => void) | null>(null);
  const reviewOutlineEnabled = useSettingsStore((s) => s.reviewOutlineEnabled);
  const setReviewOutlineEnabled = useSettingsStore((s) => s.setReviewOutlineEnabled);

  // Compute active steps based on session state
  // 基于会话状态计算当前激活的步骤
  const activeSteps = getActiveSteps(session);
  const isOutlineReady = session?.previewPhase === 'outline-ready';
  const isReviewingOutlines = session?.previewPhase === 'review';

  const persistSession = (nextSession: GenerationSessionState) => {
    setSession(nextSession);
    sessionStorage.setItem('generationSession', JSON.stringify(nextSession));
  };

  const clearOutlineReviewTimer = () => {
    if (outlineReviewTimerRef.current) {
      clearTimeout(outlineReviewTimerRef.current);
      outlineReviewTimerRef.current = null;
    }
  };
  // 在大纲 SSE 生成完之后，暂停 startGeneration 流水线，
  // 等用户「确认大纲」或「自动继续」，再往下生成内容。
  const waitForOutlineReviewChoice = (
    signal: AbortSignal,
  ): Promise<SceneOutline[]> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      outlineReviewResolveRef.current = resolve;
      // Reject on abort so navigating away (`goBackToHome`) or unmounting
      // settles this promise instead of leaking the awaiting startGeneration
      // closure. The catch at the bottom of startGeneration already swallows
      // AbortError silently.
      // 中止时拒绝，以便导航离开（goBackToHome）或卸载组件时
      const onAbort = () => {
        // 结束此 Promise，而不是泄漏等待中的 startGeneration 闭包。
        clearOutlineReviewTimer();
        // startGeneration 底部的 catch 已静默处理 AbortError。
        outlineReviewResolveRef.current = null;
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });

  // Load session from sessionStorage
  // 从 sessionStorage 加载会话
  useEffect(() => {
    cleanupOldImages(24).catch((e) => log.error(e));

    const saved = sessionStorage.getItem('generationSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GenerationSessionState;
        if (!parsed.previewPhase) {
          parsed.previewPhase = parsed.sceneOutlines?.length ? 'review' : 'preparing';
        }
        // Legacy sessions paused on the compact card — reopen the editor so the user can confirm.
        if (parsed.previewPhase === 'outline-ready' && parsed.sceneOutlines?.length) {
          parsed.previewPhase = 'review';
        }
        // Restore review intent: a saved 'review' phase without outlines means the user
        // had opened the editor mid-stream before the refresh — preserve that intent so
        // the post-stream auto-continue timer doesn't fire after SSE restart.
        // 恢复审查意图：保存的 review 阶段如果没有大纲，意味着用户在刷新前
        // 已在流式传输中打开了编辑器 — 保留该意图，以便 SSE 重启后
        // 流式传输后的自动继续计时器不会触发。
        if (parsed.previewPhase === 'review' && !parsed.sceneOutlines?.length) {
          outlineReviewIntentRef.current = true;
        }
        setSession(parsed);
      } catch (e) {
        log.error('Failed to parse generation session:', e);
      }
    }
    setSessionLoaded(true);
  }, []);

  // Abort all in-flight requests on unmount
  // 卸载组件时中止所有进行中的请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      clearOutlineReviewTimer();
    };
  }, []);

  // Get API credentials from localStorage
  // 从 localStorage 获取 API 凭据
  const getApiHeaders = () => {
    const modelConfig = getCurrentModelConfig();
    const settings = useSettingsStore.getState();
    const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
    const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];
    return {
      'Content-Type': 'application/json',
      'x-model': modelConfig.modelString,
      'x-api-key': modelConfig.apiKey,
      'x-base-url': modelConfig.baseUrl,
      'x-provider-type': modelConfig.providerType || '',
      // Image generation provider
      // 图片生成提供商
      'x-image-provider': settings.imageProviderId || '',
      'x-image-model': settings.imageModelId || '',
      'x-image-api-key': imageProviderConfig?.apiKey || '',
      'x-image-base-url': imageProviderConfig?.baseUrl || '',
      // Video generation provider
      // 视频生成提供商
      'x-video-provider': settings.videoProviderId || '',
      'x-video-model': settings.videoModelId || '',
      'x-video-api-key': videoProviderConfig?.apiKey || '',
      'x-video-base-url': videoProviderConfig?.baseUrl || '',
      // Media generation toggles
      // 媒体生成开关
      'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
      'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
    };
  };

  const withThinkingConfig = <T extends Record<string, unknown>>(body: T) => {
    const { thinkingConfig } = getCurrentModelConfig();
    return thinkingConfig ? { ...body, thinkingConfig } : body;
  };

  // Auto-start generation when session is loaded
  // 会话加载完成后自动开始生成
  useEffect(() => {
    if (!session || hasStartedRef.current) return;
    const needsOutlines = !session.sceneOutlines || session.sceneOutlines.length === 0;
    const phase = session.previewPhase;
    const shouldAutoStart =
      !phase ||
      phase === 'preparing' ||
      phase === 'generating-content' ||
      // Refresh during early-review: editor is shown but outlines weren't persisted,
      // so kick off SSE again — the editor will receive streaming outlines.
      // 早期审查期间刷新：编辑器已显示但大纲未持久化，
      // 因此重新启动 SSE — 编辑器将接收流式大纲。
      (phase === 'review' && needsOutlines);
    if (shouldAutoStart) {
      hasStartedRef.current = true;
      startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Main generation flow
  // 主生成流程
  const startGeneration = async (sessionOverride?: GenerationSessionState) => {
    const generationSession = sessionOverride ?? session;//审查时传入
    if (!generationSession) return;

    // Create AbortController for this generation run
    // AbortController:浏览器提供的用于中止请求的API
    // 在请求发起后，可以调用 abort() 方法来中止请求。
    // 一旦调用了 abort()，这个 controller 就“报废”了
    // 为此次生成运行创建 AbortController
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;//只读信号，用于中止请求

    // Use a local mutable copy so we can update it after PDF parsing
    // 使用本地可变副本，以便 PDF 解析后更新它
    let currentSession = generationSession;

    setError(null);
    setCurrentStepIndex(0);

    try {
      // Compute active steps for this session (recomputed after session mutations)
      // 计算此会话的激活步骤（会话变更后重新计算）
      let activeSteps = getActiveSteps(currentSession);

      // Determine if we need the PDF analysis step
      // 确定是否需要 PDF 分析步骤
      const hasPdfToAnalyze = !!currentSession.pdfStorageKey && !currentSession.pdfText;
      // If no PDF to analyze, skip to the next available step
      // 如果没有 PDF 需要分析，跳到下一个可用步骤
      if (!hasPdfToAnalyze) {
        const firstNonPdfIdx = activeSteps.findIndex((s) => s.id !== 'pdf-analysis');
        setCurrentStepIndex(Math.max(0, firstNonPdfIdx));
      }

      // Step 0: Parse PDF if needed
      // 步骤 0：如有需要则解析 PDF
      if (hasPdfToAnalyze) {
        log.debug('=== Generation Preview: Parsing PDF ===');
        const pdfBlob = await loadPdfBlob(currentSession.pdfStorageKey!);
        if (!pdfBlob) {
          throw new Error(t('generation.pdfLoadFailed'));
        }

        // Ensure pdfBlob is a valid Blob with content
        // 确保 pdfBlob 是有内容的有效 Blob
        if (!(pdfBlob instanceof Blob) || pdfBlob.size === 0) {
          log.error('Invalid PDF blob:', {
            type: typeof pdfBlob,
            size: pdfBlob instanceof Blob ? pdfBlob.size : 'N/A',
          });
          throw new Error(t('generation.pdfLoadFailed'));
        }

        // Wrap as a File to guarantee multipart/form-data with correct content-type
        // 包装为 File 以确保 multipart/form-data 具有正确的 content-type
        const pdfFile = new File([pdfBlob], currentSession.pdfFileName || 'document.pdf', {
          type: 'application/pdf',
        });

        const parseFormData = new FormData();
        parseFormData.append('pdf', pdfFile);

        if (currentSession.pdfProviderId) {
          parseFormData.append('providerId', currentSession.pdfProviderId);
        }
        if (currentSession.pdfProviderConfig?.apiKey?.trim()) {
          parseFormData.append('apiKey', currentSession.pdfProviderConfig.apiKey);
        }
        if (currentSession.pdfProviderConfig?.baseUrl?.trim()) {
          parseFormData.append('baseUrl', currentSession.pdfProviderConfig.baseUrl);
        }

        const parseResponse = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: parseFormData,
          signal,
        });

        if (!parseResponse.ok) {
          const errorData = await parseResponse.json();
          throw new Error(errorData.error || t('generation.pdfParseFailed'));
        }

        const parseResult = await parseResponse.json();
        if (!parseResult.success || !parseResult.data) {
          throw new Error(t('generation.pdfParseFailed'));
        }

        let pdfText = parseResult.data.text as string;

        // Truncate if needed
        // 如有需要则截断
        if (pdfText.length > MAX_PDF_CONTENT_CHARS) {
          pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);
        }

        // Create image metadata and store images
        // Prefer metadata.pdfImages (both parsers now return this)
        // 创建图片元数据并存储图片
        // 优先使用 metadata.pdfImages（两个解析器现在都返回此字段）
        const rawPdfImages = parseResult.data.metadata?.pdfImages;
        const images = rawPdfImages
          ? rawPdfImages.map(
            (img: {
              id: string;
              src?: string;
              pageNumber?: number;
              description?: string;
              width?: number;
              height?: number;
            }) => ({
              id: img.id,
              src: img.src || '',
              pageNumber: img.pageNumber || 1,
              description: img.description,
              width: img.width,
              height: img.height,
            }),
          )
          : (parseResult.data.images as string[]).map((src: string, i: number) => ({
            id: `img_${i + 1}`,
            src,
            pageNumber: 1,
          }));

        const imageStorageIds = await storeImages(images);

        const pdfImages: PdfImage[] = images.map(
          (
            img: {
              id: string;
              src: string;
              pageNumber: number;
              description?: string;
              width?: number;
              height?: number;
            },
            i: number,
          ) => ({
            id: img.id,
            src: '',
            pageNumber: img.pageNumber,
            description: img.description,
            width: img.width,
            height: img.height,
            storageId: imageStorageIds[i],
          }),
        );

        // Update session with parsed PDF data
        // 用解析后的 PDF 数据更新会话
        const updatedSession = {
          ...currentSession,
          pdfText,
          pdfImages,
          imageStorageIds,
          pdfStorageKey: undefined, // Clear so we don't re-parse / 清除以免重复解析
        };
        setSession(updatedSession);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSession));

        // Truncation warnings
        // 截断警告
        const warnings: string[] = [];
        if ((parseResult.data.text as string).length > MAX_PDF_CONTENT_CHARS) {
          warnings.push(t('generation.textTruncated', { n: MAX_PDF_CONTENT_CHARS }));
        }
        if (images.length > MAX_VISION_IMAGES) {
          warnings.push(
            t('generation.imageTruncated', { total: images.length, max: MAX_VISION_IMAGES }),
          );
        }
        if (warnings.length > 0) {
          setTruncationWarnings(warnings);
        }

        // Reassign local reference for subsequent steps
        // 为后续步骤重新赋值本地引用
        currentSession = updatedSession;
        activeSteps = getActiveSteps(currentSession);
      }

      // Step: Web Search (if enabled)
      // 步骤：网络搜索（如启用）
      const webSearchStepIdx = activeSteps.findIndex((s) => s.id === 'web-search');
      if (currentSession.requirements.webSearch && webSearchStepIdx >= 0) {
        setCurrentStepIndex(webSearchStepIdx);
        setWebSearchSources([]);

        const wsSettings = useSettingsStore.getState();
        const wsProviderId = wsSettings.webSearchProviderId;
        const wsConfig = wsSettings.webSearchProvidersConfig?.[wsProviderId];
        const res = await fetch('/api/web-search', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify(
            withThinkingConfig({
              query: currentSession.requirements.requirement,
              pdfText: currentSession.pdfText || undefined,
              providerId: wsProviderId,
              apiKey: wsConfig?.apiKey || undefined,
              baseUrl: wsConfig?.baseUrl || undefined,
              baiduSubSources: wsProviderId === 'baidu' ? wsSettings.baiduSubSources : undefined,
            }),
          ),
          signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Web search failed' }));
          throw new Error(data.error || t('generation.webSearchFailed'));
        }

        const searchData = await res.json();
        const sources = (searchData.sources || []).map((s: { title: string; url: string }) => ({
          title: s.title,
          url: s.url,
        }));
        setWebSearchSources(sources);

        const updatedSessionWithSearch = {
          ...currentSession,
          researchContext: searchData.context || '',
          researchSources: sources,
        };
        setSession(updatedSessionWithSearch);
        sessionStorage.setItem('generationSession', JSON.stringify(updatedSessionWithSearch));
        currentSession = updatedSessionWithSearch;
        activeSteps = getActiveSteps(currentSession);
      }

      // Load imageMapping early (needed for both outline and scene generation)
      // 提前加载 imageMapping（大纲和场景生成都需要）
      let imageMapping: ImageMapping = {};
      if (currentSession.imageStorageIds && currentSession.imageStorageIds.length > 0) {
        log.debug('Loading images from IndexedDB');
        imageMapping = await loadImageMapping(currentSession.imageStorageIds);
      } else if (
        currentSession.imageMapping &&
        Object.keys(currentSession.imageMapping).length > 0
      ) {
        log.debug('Using imageMapping from session (old format)');
        imageMapping = currentSession.imageMapping;
      }

      // Create stage client-side
      // 在客户端创建舞台
      const stageId = nanoid(10);//这是一个流行的JavaScript库，专门用来生成唯一ID
      const stage: Stage = {
        id: stageId,
        name: extractTopicFromRequirement(currentSession.requirements.requirement),
        description: '',
        style: 'professional',//教学/视觉风格，传给后续生成 API
        createdAt: Date.now(),//当前时间戳
        updatedAt: Date.now(),//最后更新时间戳
        interactiveMode: !!currentSession.requirements.interactiveMode,//是否启用「深度互动模式」
      };

      // ── Generate outlines first (infers languageDirective) ──
      // ── 首先生成大纲（推断 languageDirective）──
      let outlines = currentSession.sceneOutlines;//大纲
      let languageDirective = currentSession.languageDirective;//语言指令

      const outlineStepIdx = activeSteps.findIndex((s) => s.id === 'outline');
      setCurrentStepIndex(outlineStepIdx >= 0 ? outlineStepIdx : 0);
      if (!outlines || outlines.length === 0) {
        log.debug('=== Generating outlines (SSE) ===');//只在开发/调试时输出，方便在控制台看到
        setStreamingOutlines([]);//清空大纲流式传输状态
        setIsOutlineStreaming(true);//设置大纲流式传输状态为 true

        const outlineResult = await new Promise<
          {
            outlines: SceneOutline[];//SceneOutline大纲类型的数组
            languageDirective: string;
          }//Promise 成功时 resolve 的值类型
        >((resolve, reject) => {
          const collected: SceneOutline[] = [];
          let directive: string | undefined;
          // 生成大纲流式传输
          fetch('/api/generate/scene-outlines-stream', {
            method: 'POST',
            headers: getApiHeaders(),//从设置里取 LLM 配置，放在 x-model、x-api-key 等头里
            body: JSON.stringify(
              withThinkingConfig({
                requirements: currentSession.requirements,
                pdfText: currentSession.pdfText,
                pdfImages: currentSession.pdfImages,
                imageMapping,
                researchContext: currentSession.researchContext,
              }),
            ),
            signal,
          })
            .then((res) => {
              if (!res.ok) {
                return res.json().then((d) => {
                  reject(new Error(d.error || t('generation.outlineGenerateFailed')));
                });
              }

              const reader = res.body?.getReader();
              if (!reader) {
                reject(new Error(t('generation.streamNotReadable')));
                return;
              }

              const decoder = new TextDecoder();
              let sseBuffer = '';

              const pump = (): Promise<void> =>
                reader.read().then(({ done, value }) => {
                  if (value) {
                    sseBuffer += decoder.decode(value, { stream: !done });
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop() || '';

                    for (const line of lines) {
                      if (!line.startsWith('data: ')) continue;
                      try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'languageDirective') {
                          directive = evt.data;
                        } else if (evt.type === 'outline') {
                          collected.push(evt.data);
                          setStreamingOutlines([...collected]);
                        } else if (evt.type === 'retry') {
                          collected.length = 0;
                          setStreamingOutlines([]);
                          setStatusMessage(t('generation.outlineRetrying'));
                        } else if (evt.type === 'done') {
                          directive = evt.languageDirective || directive;
                          resolve({
                            outlines: evt.outlines || collected,
                            languageDirective:
                              directive ||
                              'Teach in the language that matches the user requirement.',
                          });
                          return;
                        } else if (evt.type === 'error') {
                          reject(new Error(evt.error));
                          return;
                        }
                      } catch (e) {
                        log.error('Failed to parse outline SSE:', line, e);
                      }
                    }
                  }
                  if (done) {
                    if (collected.length > 0) {
                      resolve({
                        outlines: collected,
                        languageDirective:
                          directive || 'Teach in the language that matches the user requirement.',
                      });
                    } else {
                      reject(new Error(t('generation.outlineEmptyResponse')));
                    }
                    return;
                  }
                  return pump();
                });

              pump().catch(reject);
            })
            .catch(reject);
        });

        outlines = outlineResult.outlines;
        languageDirective = outlineResult.languageDirective;
        setIsOutlineStreaming(false);

        const updatedSession: GenerationSessionState = {
          ...currentSession,
          sceneOutlines: outlines,
          languageDirective,
          previewPhase: 'review',
        };
        persistSession(updatedSession);
        currentSession = updatedSession;
        setStreamingOutlines(outlines);

        setStatusMessage('');
        setIsConfirmingOutlines(false);
        outlines = await waitForOutlineReviewChoice(signal);
        clearOutlineReviewTimer();
        currentSession = {
          ...currentSession,
          sceneOutlines: outlines,
          previewPhase: 'generating-content',
        };
        persistSession(currentSession);

        // User has confirmed the outline review. Now it's safe to wipe the homepage
        // draft cache; before this point, "back to requirements" must restore the
        // user's original input.
        // 用户已确认大纲审查。现在可以安全地清除首页草稿缓存；在此之前，“返回需求”必须恢复用户的原始输入。
        try {
          localStorage.removeItem('requirementDraft');
        } catch {
          /* ignore */
        }
      }

      // Move to next step
      // 进入下一步
      setStatusMessage('');
      if (!outlines || outlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }

      // Store languageDirective on the stage
      // 将 languageDirective 存储到舞台上
      if (languageDirective) {
        stage.languageDirective = languageDirective;
      }

      // ── Agent generation (after outlines — uses languageDirective + outlines) ──
      // ── 智能体生成（大纲之后 — 使用 languageDirective + 大纲）──
      const settings = useSettingsStore.getState();
      let agents: Array<{
        id: string;
        name: string;
        role: string;
        persona?: string;//角色描述
      }> = [];

      if (settings.agentMode === 'auto') {
        const agentStepIdx = activeSteps.findIndex((s) => s.id === 'agent-generation');
        if (agentStepIdx >= 0) setCurrentStepIndex(agentStepIdx);

        try {
          const allAvatars = [
            {
              path: '/avatars/teacher.png',
              desc: 'Male teacher with glasses, holding a book, green background',
            },
            {
              path: '/avatars/teacher-2.png',
              desc: 'Female teacher with long dark hair, blue traditional outfit, gentle expression',
            },
            {
              path: '/avatars/assist.png',
              desc: 'Young female assistant with glasses, pink background, friendly smile',
            },
            {
              path: '/avatars/assist-2.png',
              desc: 'Young female in orange top and purple overalls, cheerful and approachable',
            },
            {
              path: '/avatars/clown.png',
              desc: 'Energetic girl with glasses pointing up, green shirt, lively and fun',
            },
            {
              path: '/avatars/clown-2.png',
              desc: 'Playful girl with curly hair doing rock gesture, blue shirt, humorous vibe',
            },
            {
              path: '/avatars/curious.png',
              desc: 'Surprised boy with glasses, hand on cheek, curious expression',
            },
            {
              path: '/avatars/curious-2.png',
              desc: 'Boy with backpack holding a book and question mark bubble, inquisitive',
            },
            {
              path: '/avatars/note-taker.png',
              desc: 'Studious boy with glasses, blue shirt, calm and organized',
            },
            {
              path: '/avatars/note-taker-2.png',
              desc: 'Active boy with yellow backpack waving, blue outfit, enthusiastic learner',
            },
            {
              path: '/avatars/thinker.png',
              desc: 'Thoughtful girl with hand on chin, purple background, contemplative',
            },
            {
              path: '/avatars/thinker-2.png',
              desc: 'Girl reading a book intently, long dark hair, intellectual and focused',
            },
          ];

          const getAvailableVoicesForGeneration = () => {//获取可用的语音列表
            const providers = getEnabledProvidersWithVoices(
              settings.ttsProvidersConfig,
              voxcpmProfiles,
            );
            return providers.flatMap((p) =>
              p.voices.map((v) => ({
                providerId: p.providerId,
                voiceId: v.id,
                voiceName: v.name,
                voiceLanguage: v.language,
              })),
            );
          };

          const agentResp = await fetch('/api/generate/agent-profiles', {//生成智能体配置
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify(
              withThinkingConfig({
                stageInfo: { name: stage.name, description: stage.description },//课程名、描述
                sceneOutlines: outlines.map((o) => ({
                  title: o.title,
                  description: o.description,
                })),//每页标题/描述，帮 LLM 决定需要几个 Agent
                languageDirective,//教学语言（名字、人设要用什么语言）
                availableAvatars: allAvatars.map((a) => a.path),//可选头像路径
                avatarDescriptions: allAvatars.map((a) => ({ path: a.path, desc: a.desc })),//头像描述
                availableVoices: getAvailableVoicesForGeneration(),//可用语音列表
              }),
            ),
            signal,
          });

          if (!agentResp.ok) throw new Error('Agent generation failed');
          const agentData = await agentResp.json();
          if (!agentData.success) throw new Error(agentData.error || 'Agent generation failed');

          // Save to IndexedDB and registry. The agent-profile LLM has already
          // bound each agent's voice (from availableVoices); the fallback for an
          // invalid/unavailable voice is applied later at the live TTS call.
          // 保存到 IndexedDB 和注册表。agent-profile LLM 已经
          // 为每个智能体绑定了语音（来自 availableVoices）；无效/不可用语音的
          // 回退将在后续实时 TTS 调用时应用。
          const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
          const savedIds = await saveGeneratedAgents(stage.id, agentData.agents);
          settings.setSelectedAgentIds(savedIds);
          stage.agentIds = savedIds;

          // Show card-reveal modal, continue generation once all cards are revealed
          // 显示卡片揭示模态框，所有卡片揭示完成后继续生成
          setGeneratedAgents(agentData.agents);
          setShowAgentReveal(true);
          await new Promise<void>((resolve) => {
            agentRevealResolveRef.current = resolve;
          });

          agents = savedIds
            .map((id) => useAgentRegistry.getState().getAgent(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              name: a!.name,
              role: a!.role,
              persona: a!.persona,
            }));
        } catch (err: unknown) {
          log.warn('[Generation] Agent generation failed, falling back to presets:', err);
          const registry = useAgentRegistry.getState();
          const fallbackIds = settings.selectedAgentIds.filter((id) => {
            const a = registry.getAgent(id);
            return a && !a.isGenerated;
          });
          agents = fallbackIds
            .map((id) => registry.getAgent(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              name: a!.name,
              role: a!.role,
              persona: a!.persona,
            }));
          stage.agentIds = fallbackIds;
        }
      } else {
        // Preset mode — use selected agents (include persona)
        // Filter out stale generated agent IDs that may linger in settings
        // 预设模式 — 使用选中的智能体（包含 persona）
        // 过滤掉可能残留在设置中的过期生成智能体 ID
        const registry = useAgentRegistry.getState();
        const presetAgentIds = settings.selectedAgentIds.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        agents = presetAgentIds
          .map((id) => registry.getAgent(id))
          .filter(Boolean)
          .map((a) => ({
            id: a!.id,
            name: a!.name,
            role: a!.role,
            persona: a!.persona,
          }));
        stage.agentIds = presetAgentIds;
      }

      // Move to scene generation step
      // 进入场景生成步骤
      setStatusMessage('');
      if (!outlines || outlines.length === 0) {
        throw new Error(t('generation.outlineEmptyResponse'));
      }

      // Store stage and outlines
      // 存储舞台和大纲
      const store = useStageStore.getState();
      stage.videoManifest = buildVideoManifestFromOutlines(outlines);
      store.setStage(stage);
      store.setOutlines(outlines);

      // Advance to slide-content step
      // 推进到幻灯片内容步骤
      const contentStepIdx = activeSteps.findIndex((s) => s.id === 'slide-content');
      if (contentStepIdx >= 0) setCurrentStepIndex(contentStepIdx);

      // Build stageInfo and userProfile for API call
      // 为 API 调用构建 stageInfo 和 userProfile
      const stageInfo = {
        name: stage.name,
        description: stage.description,
        style: stage.style,
      };

      const userProfile =
        currentSession.requirements.userNickname || currentSession.requirements.userBio
          ? `Student: ${currentSession.requirements.userNickname || 'Unknown'}${currentSession.requirements.userBio ? ` — ${currentSession.requirements.userBio}` : ''}`
          : undefined;

      // Generate ONLY the first scene
      // 仅生成第一个场景
      store.setGeneratingOutlines(outlines);

      const firstOutline = outlines[0];

      // Step 2: Generate content (currentStepIndex is already 2)
      // 步骤 2：生成内容（currentStepIndex 已经是 2）
      const contentResp = await fetch('/api/generate/scene-content', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(
          withThinkingConfig({
            outline: firstOutline,// 当前要生成的那一页大纲（第一页）
            allOutlines: outlines,// 全部大纲，给 AI 看整体课程结构
            pdfImages: currentSession.pdfImages,//从 PDF 引用图片；AI 在 JSON 里写 src: "img_1"，服务端换成真实 base64
            imageMapping,
            stageInfo,// 课程名、描述、风格
            stageId: stage.id,
            agents,// 老师/同学等 Agent 信息
            languageDirective, // 用什么语言讲
          }),
        ),
        signal,
      });

      if (!contentResp.ok) {
        const errorData = await contentResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const contentData = await contentResp.json();
      if (!contentData.success || !contentData.content) {
        throw new Error(contentData.error || t('generation.sceneGenerateFailed'));
      }

      // Generate actions (activate actions step indicator)
      // 生成动作（激活动作步骤指示器）
      const actionsStepIdx = activeSteps.findIndex((s) => s.id === 'actions');
      setCurrentStepIndex(actionsStepIdx >= 0 ? actionsStepIdx : currentStepIndex + 1);

      const actionsResp = await fetch('/api/generate/scene-actions', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(
          withThinkingConfig({
            outline: contentData.effectiveOutline || firstOutline,
            allOutlines: outlines,
            content: contentData.content,
            stageId: stage.id,
            agents,
            previousSpeeches: [],
            userProfile,
            languageDirective,
          }),
        ),
        signal,
      });

      if (!actionsResp.ok) {
        const errorData = await actionsResp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || t('generation.sceneGenerateFailed'));
      }

      const data = await actionsResp.json();
      if (!data.success || !data.scene) {
        throw new Error(data.error || t('generation.sceneGenerateFailed'));
      }

      // Generate TTS for first scene (part of actions step — blocking)
      // 为第一个场景生成 TTS（动作步骤的一部分 — 阻塞式）
      if (
        settings.ttsEnabled &&
        settings.ttsProviderId !== 'browser-native-tts' &&
        isTTSProviderEnabled(
          settings.ttsProviderId,
          settings.ttsProvidersConfig?.[settings.ttsProviderId],
        )
      ) {
        const ttsProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
        const providerOptions =
          settings.ttsProviderId === 'voxcpm-tts'
            ? {
              ...(ttsProviderConfig?.providerOptions || {}),
              ...(await getVoxCPMProviderOptions(settings.ttsVoice, {
                role: 'teacher',
                language: languageDirective,
              })),
            }
            : undefined;
        const speechActions = (data.scene.actions || []).filter(
          (a: { type: string; text?: string }) => a.type === 'speech' && a.text,
        );

        let ttsFailCount = 0;
        for (const action of speechActions) {
          const audioId = `tts_${action.id}`;
          action.audioId = audioId;
          try {
            const resp = await fetch('/api/generate/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: action.text,
                audioId,
                ttsProviderId: settings.ttsProviderId,
                ttsModelId: ttsProviderConfig?.modelId,
                ttsVoice: settings.ttsVoice,
                ttsSpeed: settings.ttsSpeed,
                ttsApiKey: ttsProviderConfig?.apiKey || undefined,
                // Managed providers resolve their base URL server-side; only
                // send the client's own base URL (custom providers).
                // 托管提供商在服务端解析其 base URL；
                // 仅发送客户端自己的 base URL（自定义提供商）。
                ttsBaseUrl:
                  ttsProviderConfig?.baseUrl ||
                  ttsProviderConfig?.customDefaultBaseUrl ||
                  undefined,
                ttsProviderOptions: providerOptions,
              }),
              signal,
            });
            if (!resp.ok) {
              ttsFailCount++;
              continue;
            }
            const ttsData = await resp.json();
            if (!ttsData.success) {
              ttsFailCount++;
              continue;
            }
            const binary = atob(ttsData.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: `audio/${ttsData.format}` });
            await db.audioFiles.put({
              id: audioId,
              blob,
              format: ttsData.format,
              createdAt: Date.now(),
            });
          } catch (err) {
            log.warn(`[TTS] Failed for ${audioId}:`, err);
            ttsFailCount++;
          }
        }

        if (ttsFailCount > 0 && speechActions.length > 0) {
          throw new Error(t('generation.speechFailed'));
        }
      }

      // Add scene to store and navigate
      // 添加场景到 store 并导航
      store.addScene(data.scene);//把第 1 页完整场景（幻灯片内容、actions、audioId 等）加入 scenes[]
      store.setCurrentSceneId(data.scene.id);//进入教室后默认展示这一页

      // Set remaining outlines as skeleton placeholders
      // 将剩余大纲设置为骨架占位符
      const remaining = outlines.filter((o) => o.order !== data.scene.order);
      store.setGeneratingOutlines(remaining);

      // Store generation params for classroom to continue generation
      // 存储生成参数，供教室页面继续生成
      sessionStorage.setItem(
        'generationParams',
        JSON.stringify({
          pdfImages: currentSession.pdfImages,
          agents,
          userProfile,
          languageDirective,
        }),
      );

      sessionStorage.removeItem('generationSession');
      await store.saveToStorage();
      router.push(`/classroom/${stage.id}`);
    } catch (err) {
      setIsOutlineStreaming(false);
      // AbortError is expected when navigating away — don't show as error
      // 导航离开时的 AbortError 是预期的 — 不作为错误显示
      if (err instanceof DOMException && err.name === 'AbortError') {
        log.info('[GenerationPreview] Generation aborted');
        return;
      }
      sessionStorage.removeItem('generationSession');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const extractTopicFromRequirement = (requirement: string): string => {
    const trimmed = requirement.trim();
    if (trimmed.length <= 500) {
      return trimmed;
    }
    return trimmed.substring(0, 500).trim() + '...';
  };

  const goBackToHome = () => {
    abortControllerRef.current?.abort();
    clearOutlineReviewTimer();
    outlineReviewIntentRef.current = false;
    sessionStorage.removeItem('generationSession');
    router.push('/');
  };

  // Triggered when the user clicks the streaming outline card mid-stream.
  // SSE keeps running; only the surface morph + intent flag change.
  // 当用户在流式传输中点击流式大纲卡片时触发。
  // SSE 继续运行；仅改变界面形态和意图标记。
  const handleExpandStreamingOutline = () => {
    if (!session) return;
    clearOutlineReviewTimer();
    setStatusMessage('');
    outlineReviewIntentRef.current = true;
    persistSession({
      ...session,
      previewPhase: 'review',
    });
  };

  // Inverse of expand. Mid-stream: shrink back to the streaming preview card so
  // the user can keep watching while SSE fills in the rest. Post-stream: shrink
  // back to the small card; generation stays paused until the user confirms.
  // 展开的逆操作。流式传输中：缩回流式预览卡片，让用户继续观看 SSE 填充剩余内容。
  // 流式传输后：缩回小卡片；在用户确认前不会继续生成内容。
  const handleCollapseEditor = () => {
    if (!session) return;
    if (isOutlineStreaming) {
      // Intentionally drop the review-intent flag: collapsing mid-stream is the
      // user saying "actually, never mind". When SSE finishes, the no-early-open
      // path runs and the standard `reviewOutlineEnabled` / auto-continue rules
      // decide what happens next. There is no parked promise to settle yet —
      // the promise is created only after SSE completes (see line 583).
      // 故意丢弃审查意图标记：流式传输中折叠意味着用户说“算了”。
      // SSE 完成后，运行未提前打开的路径，标准的 reviewOutlineEnabled / 自动继续规则
      // 决定接下来发生什么。此时没有待处理的 Promise —
      // Promise 仅在 SSE 完成后创建（见第 583 行）。
      outlineReviewIntentRef.current = false;
      persistSession({ ...session, previewPhase: 'preparing' });
      setStatusMessage('');
      return;
    }
    const collapsedOutlines = session.sceneOutlines ?? streamingOutlines;
    if (!collapsedOutlines || collapsedOutlines.length === 0) return;
    outlineReviewIntentRef.current = false;
    persistSession({
      ...session,
      sceneOutlines: collapsedOutlines,
      previewPhase: 'outline-ready',
    });
    setStatusMessage('');
  };

  const handleOutlinesChange = (outlines: SceneOutline[]) => {
    if (!session) return;
    // Streaming SSE owns `streamingOutlines` while it's running; ignore editor
    // changes until the stream completes (the editor is read-only in that state
    // anyway, but guard defensively against any racy event).
    // 流式 SSE 在运行期间拥有 streamingOutlines；在流完成前忽略编辑器变更
    // （编辑器在该状态下是只读的，但防御性地防止任何竞态事件）。
    if (isOutlineStreaming) return;
    persistSession({
      ...session,
      sceneOutlines: outlines,
      previewPhase: 'review',
    });
  };

  const handleConfirmOutlines = () => {
    const finalOutlines = session?.sceneOutlines ?? streamingOutlines;
    if (!finalOutlines || finalOutlines.length === 0) return;
    setIsConfirmingOutlines(true);
    clearOutlineReviewTimer();
    outlineReviewIntentRef.current = false;

    if (outlineReviewResolveRef.current) {
      const resolve = outlineReviewResolveRef.current;
      outlineReviewResolveRef.current = null;
      resolve(finalOutlines);
      return;
    }

    // Fallback: no parked promise (session restored mid-review). The button's
    // loading state was set above to give the click immediate feedback, but the
    // editor is about to unmount anyway as we drive the next phase ourselves.
    // Reset the flag so the state doesn't linger if `startGeneration` later
    // re-renders the editor for any reason.
    // 回退：没有待处理的 Promise（会话在审查中恢复）。按钮的
    // 加载状态已在上面设置以给点击即时反馈，但编辑器即将卸载，因为我们自行驱动下一阶段。
    // 重置标记，以防 startGeneration 后续因任何原因重新渲染编辑器时状态残留。
    setIsConfirmingOutlines(false);
    const confirmedSession: GenerationSessionState = {
      ...(session as GenerationSessionState),
      sceneOutlines: finalOutlines,
      previewPhase: 'generating-content',
    };
    persistSession(confirmedSession);
    hasStartedRef.current = true;
    void startGeneration(confirmedSession);
  };

  // Still loading session from sessionStorage
  // 仍在从 sessionStorage 加载会话
  if (!sessionLoaded) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <div className="size-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // No session found
  // 未找到会话
  if (!session) {
    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center space-y-4">
            <AlertCircle className="size-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">{t('generation.sessionNotFound')}</h2>
            <p className="text-sm text-muted-foreground">{t('generation.sessionNotFoundDesc')}</p>
            <Button onClick={() => router.push('/')} className="w-full">
              <ArrowLeft className="size-4 mr-2" />
              {t('generation.backToHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const activeStep =
    activeSteps.length > 0
      ? activeSteps[Math.min(currentStepIndex, activeSteps.length - 1)]
      : ALL_STEPS[0];

  if (isReviewingOutlines) {
    const outlineStepIndex = Math.max(
      0,
      activeSteps.findIndex((step) => step.id === 'outline'),
    );
    // Editor source-of-truth: prefer the persisted final list; fall back to the
    // live streaming buffer so the editor can render mid-stream after expansion.
    // 编辑器数据源：优先使用持久化的最终列表；回退到
    // 实时流式缓冲区，以便编辑器在展开后能在流式传输中渲染。
    const editorOutlines = session.sceneOutlines ?? streamingOutlines ?? [];

    return (
      <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-4 z-20"
        >
          <Button variant="ghost" size="sm" onClick={goBackToHome} disabled={isConfirmingOutlines}>
            <ArrowLeft className="size-4 mr-2" />
            {t('generation.backToHome')}
          </Button>
        </motion.div>

        <div className="z-10 w-full max-w-3xl pt-16 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex justify-center gap-2">
              {activeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    idx < outlineStepIndex
                      ? 'w-1.5 bg-blue-500/30'
                      : idx === outlineStepIndex
                        ? 'w-8 bg-blue-500'
                        : 'w-1.5 bg-muted/50',
                  )}
                />
              ))}
            </div>

            <div className="max-w-2xl space-y-2 text-center mx-auto">
              <h2 className="text-2xl font-bold tracking-tight">
                {t('generation.reviewOutlineTitle')}
              </h2>
              <p className="text-muted-foreground text-sm md:text-base">
                {isOutlineStreaming
                  ? t('generation.reviewOutlineStreamingDesc')
                  : t('generation.reviewOutlineDesc')}
              </p>
            </div>

            {error && (
              <div className="mx-auto max-w-2xl rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <OutlinesEditor
              outlines={editorOutlines}
              onChange={handleOutlinesChange}
              onConfirm={handleConfirmOutlines}
              onBack={goBackToHome}
              alwaysReview={reviewOutlineEnabled}
              onAlwaysReviewChange={setReviewOutlineEnabled}
              isLoading={isConfirmingOutlines}
              isStreaming={isOutlineStreaming}
              onCollapse={handleCollapseEditor}
            />
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden text-center">
      {/* Background Decor / 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* Back button / 返回按钮 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToHome}>
          <ArrowLeft className="size-4 mr-2" />
          {t('generation.backToHome')}
        </Button>
      </motion.div>

      <div className="z-10 w-full max-w-lg space-y-8 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="relative overflow-hidden border-muted/40 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl min-h-[400px] flex flex-col items-center justify-center p-8 md:p-12">
            {/* Progress Dots / 进度点 */}
            <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
              {activeSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    idx < currentStepIndex
                      ? 'w-1.5 bg-blue-500/30'
                      : idx === currentStepIndex
                        ? 'w-8 bg-blue-500'
                        : 'w-1.5 bg-muted/50',
                  )}
                />
              ))}
            </div>

            {/* Central Content / 中心内容 */}
            <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 mt-4">
              {/* Icon / Visualizer Container / 图标 / 可视化容器 */}
              <div className="relative size-48 flex items-center justify-center">
                <AnimatePresence mode="popLayout">
                  {error ? (
                    <motion.div
                      key="error"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-red-500/10 flex items-center justify-center border-2 border-red-500/20"
                    >
                      <AlertCircle className="size-16 text-red-500" />
                    </motion.div>
                  ) : isComplete ? (//这个模块没用，isComplete为恒为false
                    <motion.div
                      key="complete"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="size-32 rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500/20"
                    >
                      <CheckCircle2 className="size-16 text-green-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={activeStep.id}
                      initial={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
                      transition={{ duration: 0.4 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={activeStep.id}//当前步骤的id
                        outlines={session.sceneOutlines ?? streamingOutlines}//大纲列表，只在 outline 步骤传给
                        webSearchSources={webSearchSources}//联网搜索到的来源，形如 { title, url }[]，只在 web-search 步骤用。
                        onExpandOutline={
                          activeStep.id === 'outline' ? handleExpandStreamingOutline : undefined
                        }//点击大纲卡片时的回调，只在大纲步骤才传入，其他步骤传 undefined。把 previewPhase 改成 'review'
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Content / 文本内容 */}
              <div className="space-y-3 max-w-sm mx-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={error ? 'error' : isComplete ? 'done' : activeStep.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {error
                        ? t('generation.generationFailed')
                        : isComplete
                          ? t('generation.generationComplete')
                          : t(activeStep.title)}
                    </h2>
                    <p className="text-muted-foreground text-base">
                      {error
                        ? error
                        : isComplete
                          ? t('generation.classroomReady')
                          : statusMessage || t(activeStep.description)}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Truncation warning indicator / 截断警告指示器 */}
                <AnimatePresence>
                  {truncationWarnings.length > 0 && !error && !isComplete && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 30,
                      }}
                      className="flex justify-center"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            type="button"
                            animate={{
                              boxShadow: [
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                                '0 0 16px 4px rgba(251, 191, 36, 0.12), 0 0 4px 1px rgba(251, 191, 36, 0.08)',
                                '0 0 0 0 rgba(251, 191, 36, 0), 0 0 0 0 rgba(251, 191, 36, 0)',
                              ],
                            }}
                            transition={{
                              duration: 3,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                            className="relative size-7 rounded-full flex items-center justify-center cursor-default
                                       bg-gradient-to-br from-amber-400/15 to-orange-400/10
                                       border border-amber-400/25 hover:border-amber-400/40
                                       hover:from-amber-400/20 hover:to-orange-400/15
                                       transition-colors duration-300
                                       focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
                          >
                            <AlertTriangle
                              className="size-3.5 text-amber-500 dark:text-amber-400"
                              strokeWidth={2.5}
                            />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          <div className="space-y-1 py-0.5">
                            {truncationWarnings.map((w, i) => (
                              <p key={i} className="text-xs leading-relaxed">
                                {w}
                              </p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Footer Action / 底部操作 */}
        <div className="h-16 flex items-center justify-center w-full">
          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xs"
              >
                <Button size="lg" variant="outline" className="w-full h-12" onClick={goBackToHome}>
                  {t('generation.goBackAndRetry')}
                </Button>
              </motion.div>
            ) : isOutlineReady ? null : !isComplete ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/50 font-medium uppercase tracking-widest"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
                {generatedAgents.length > 0 && !showAgentReveal && (
                  <button
                    onClick={() => setShowAgentReveal(true)}
                    className="ml-2 flex items-center gap-1.5 rounded-full border border-purple-300/30 bg-purple-500/10 px-3 py-1 text-xs font-medium normal-case tracking-normal text-purple-400 transition-colors hover:bg-purple-500/20 hover:text-purple-300"
                  >
                    <Bot className="size-3" />
                    {t('generation.viewAgents')}
                  </button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Agent Reveal Modal / 智能体揭示模态框 */}
      <AgentRevealModal
        agents={generatedAgents}
        open={showAgentReveal}
        onClose={() => setShowAgentReveal(false)}
        onAllRevealed={() => {
          agentRevealResolveRef.current?.();
          agentRevealResolveRef.current = null;
        }}
      />
    </div>
  );
}

export default function GenerationPreviewPage() {
  return (
    // React 内置的一个组件，用于处理 异步渲染 的场景。
    // 简单说就是：当子组件还在"加载中"时，显示一个 fallback（兜底 UI），加载完成后切换到实际内容。
    <Suspense
      fallback={
        <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
          <div className="animate-pulse space-y-4 text-center">
            <div className="h-8 w-48 bg-muted rounded mx-auto" />
            <div className="h-4 w-64 bg-muted rounded mx-auto" />
          </div>
        </div>
      }
    >
      <GenerationPreviewContent />
    </Suspense>
  );
}
