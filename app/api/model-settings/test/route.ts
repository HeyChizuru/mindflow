import { testModel } from '@/lib/ai/test-model';

export const runtime = 'nodejs';
export const maxDuration = 65;

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  // Testing is a same-origin UI action. Never accept cross-site requests containing model credentials.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '请求来源无效' }, { status: 403, headers });
  try {
    const body: unknown = await request.json();
    const kind = typeof body === 'object' && body !== null && 'kind' in body ? body.kind : null;
    if (kind !== 'chat' && kind !== 'embedding') return Response.json({ error: '请选择要测试的模型类型' }, { status: 400, headers });
    return Response.json(await testModel(request, kind), { headers });
  } catch {
    return Response.json({ error: '模型测试未完成，请检查配置后重试' }, { status: 400, headers });
  }
}
