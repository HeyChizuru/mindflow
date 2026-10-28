export type ModelKind = 'chat' | 'embedding';
export type ModelConnection = { baseUrl: string; apiKey: string; model: string };
export type ModelSettings = Record<ModelKind, ModelConnection>;
export type ModelCheck = { name: string; ok: boolean; message: string };
export type ModelTestResult = { checks: ModelCheck[] };

export const emptyModelConnection = (): ModelConnection => ({ baseUrl: '', apiKey: '', model: '' });
