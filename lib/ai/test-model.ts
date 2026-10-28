import 'server-only';
import { APICallError, tool } from 'ai';
import { z } from 'zod';
import { requireChatModel } from '@/lib/ai/openai-compat';
import { LlmSettingsError } from '@/lib/ai/llm-connection';
import { callLLM, streamLLM } from '@/lib/ai/llm';
import { trustSystemCertificates } from '@/lib/ai/system-ca';
import { requireEmbeddingModel } from '@/lib/knowledge/embedding-config';
import { embedTexts, EmbeddingDimensionError } from '@/lib/knowledge/embed';
import type { ModelCheck, ModelKind, ModelTestResult } from '@/lib/types/model-settings';

function failureMessage(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) return '测试超时或已取消，请手动重试。';
  if (error instanceof LlmSettingsError) return '该组配置缺失或 API 地址无效，请检查后重试。';
  if (error instanceof EmbeddingDimensionError) return '返回向量不满足当前知识库要求的 1024 维，请检查向量模型。';
  if (APICallError.isInstance(error)) {
    if ([401, 403].includes(error.statusCode ?? 0)) return '认证失败，请检查该组 API Key 与访问权限。';
    if (error.statusCode === 429) return '服务限流或额度不足，请稍后重试。';
  }
  return '服务未完成所需能力测试，请检查地址、模型名称或服务支持情况。';
}

export async function testModel(request: Request, kind: ModelKind): Promise<ModelTestResult> {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60000)]);
  const checks: ModelCheck[] = [];
  const check = async (name: string, run: () => Promise<boolean>, message: string) => {
    try {
      signal.throwIfAborted();
      const ok = await run();
      signal.throwIfAborted();
      checks.push({ name, ok, message: ok ? message : '未取得符合本项要求的结果，请检查模型能力。' });
    } catch (error) { checks.push({ name, ok: false, message: failureMessage(error, signal) }); }
  };

  if (kind === 'embedding') {
    await check('向量生成与维度', async () => {
      trustSystemCertificates();
      const { model } = await requireEmbeddingModel(request);
      const vectors = await embedTexts(['MindFlow 模型配置测试'], model, { abortSignal: signal, maxRetries: 0 });
      return vectors.length === 1 && vectors[0].length === 1024 && vectors[0].every(Number.isFinite);
    }, '已生成有效的 1024 维向量。');
    return { checks };
  }

  let model;
  try { model = (await requireChatModel(request)).chat; }
  catch (error) {
    return { checks: ['基础回复', '工具调用与结构化结果', '流式正文'].map(name => ({ name, ok: false, message: failureMessage(error, signal) })) };
  }
  const params = { model, maxRetries: 0, maxOutputTokens: 512, abortSignal: signal };
  await check('基础回复', async () => {
    const result = await callLLM({ ...params, prompt: 'Reply with the word OK.' }, 'model-test');
    return result.finishReason === 'stop' && !!result.text.trim();
  }, '已收到完整文本回复。');
  await check('工具调用与结构化结果', async () => {
    const schema = z.object({ status: z.literal('ok') });
    const result = await callLLM({ ...params, prompt: 'Call structured_result exactly once with status="ok". Do not reply with plain text.',
      tools: { structured_result: tool({ description: 'Return the test decision.', inputSchema: schema }) },
      toolChoice: 'auto', stopWhen: () => true,
    }, 'model-test');
    return result.finishReason === 'tool-calls' && result.toolCalls.length === 1
      && result.toolCalls[0].toolName === 'structured_result' && !result.toolCalls[0].invalid
      && schema.safeParse(result.toolCalls[0].input).success;
  }, '已收到并校验工具调用的结构化结果。');
  await check('流式正文', async () => {
    const stream = streamLLM({ ...params, prompt: 'Reply with a short sentence saying the streaming test is complete.', onError: () => {} }, 'model-test');
    let text = '';
    for await (const chunk of stream.fullStream) {
      signal.throwIfAborted();
      if (chunk.type === 'error') throw chunk.error;
      if (chunk.type === 'text-delta') text += chunk.text;
    }
    return !!text.trim() && await stream.finishReason === 'stop';
  }, '已收到流式正文，服务正常结束。');
  return { checks };
}
