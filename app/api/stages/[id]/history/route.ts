import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getStageHistoryItem } from '@/lib/services/stage-history';
import { StageNotFoundError } from '@/lib/services/stages';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getStageHistoryItem(id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof StageNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ZodError) return NextResponse.json({ error: '课堂地址无效' }, { status: 400 });
    console.error('[GET /api/stages/[id]/history]', error);
    return NextResponse.json({ error: '读取课堂状态失败，请重试' }, { status: 500 });
  }
}
