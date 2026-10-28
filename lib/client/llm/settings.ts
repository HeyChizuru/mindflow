import { emptyModelConnection, type ModelConnection, type ModelKind, type ModelSettings } from '@/lib/types/model-settings';
import { modelConnectionSchema } from '@/lib/validators/model-settings';

const storageKeys: Record<ModelKind, string> = {
  chat: 'mindflow.model.chat.v1', embedding: 'mindflow.model.embedding.v1',
};

export function readModelConnection(kind: ModelKind): { value: ModelConnection; error?: string } {
  try {
    const raw = window.localStorage.getItem(storageKeys[kind]);
    if (raw === null) return { value: emptyModelConnection() };
    const parsed = modelConnectionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { value: parsed.data };
    return { value: emptyModelConnection(), error: '本地配置已损坏，请重新填写保存或清除。' };
  } catch {
    return { value: emptyModelConnection(), error: '无法读取本地配置，请检查浏览器存储权限或重新配置。' };
  }
}

export function saveModelConnection(kind: ModelKind, value: ModelConnection): void {
  const parsed = modelConnectionSchema.parse(value);
  try { window.localStorage.setItem(storageKeys[kind], JSON.stringify(parsed)); }
  catch { throw new Error('保存失败，请检查浏览器存储权限；新配置尚未生效。'); }
}

export function clearModelConnection(kind: ModelKind): void {
  try { window.localStorage.removeItem(storageKeys[kind]); }
  catch { throw new Error('清除失败，原配置仍保留，请检查浏览器存储权限。'); }
}

export function modelSettingsSnapshot(): ModelSettings {
  return { chat: { ...readModelConnection('chat').value }, embedding: { ...readModelConnection('embedding').value } };
}

/** No required-field assertion here: chat questions and quiz answers must still reach their save APIs. */
export function modelRequestHeaders(includeEmbedding: boolean, settings = modelSettingsSnapshot()): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const kind of includeEmbedding ? ['chat', 'embedding'] as const : ['chat'] as const) {
    const parsed = modelConnectionSchema.safeParse(settings[kind]);
    if (!parsed.success) continue;
    headers[`x-mindflow-llm-${kind}-api-key`] = parsed.data.apiKey;
    headers[`x-mindflow-llm-${kind}-base-url`] = parsed.data.baseUrl;
    headers[`x-mindflow-llm-${kind}-model`] = parsed.data.model;
  }
  return headers;
}

export function connectionTestHeaders(kind: ModelKind, connection: ModelConnection): Record<string, string> {
  const settings: ModelSettings = { chat: emptyModelConnection(), embedding: emptyModelConnection() };
  settings[kind] = connection;
  return modelRequestHeaders(true, settings);
}

export function openModelSettings(): void {
  window.dispatchEvent(new Event('mindflow:open-model-settings'));
}
