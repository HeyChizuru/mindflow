import { z } from 'zod';

// These values travel in HTTP headers. Never accept control characters or embedded credentials in URLs.
export const modelConnectionSchema = z.object({
  baseUrl: z.string().trim().min(1, '请填写 API 地址').max(2048, 'API 地址过长').refine(value => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
        && !url.search && !url.hash && /^[\x21-\x7e]+$/.test(value);
    } catch { return false; }
  }, '请填写 http(s) API 根地址，不含账号、查询参数或片段'),
  apiKey: z.string().trim().min(1, '请填写 API Key').max(8192, 'API Key 过长')
    .regex(/^[\x21-\x7e]+$/, 'API Key 不能包含空格、换行或非 ASCII 字符'),
  model: z.string().trim().min(1, '请填写模型名称').max(256, '模型名称过长')
    .regex(/^[\x21-\x7e]+$/, '模型名称不能包含空格、换行或非 ASCII 字符'),
}).strict();

export const modelTestResultSchema = z.object({ checks: z.array(z.object({
  name: z.string(), ok: z.boolean(), message: z.string(),
})).min(1).max(3) });
