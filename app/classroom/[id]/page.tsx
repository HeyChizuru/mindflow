'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Stage } from '@/components/stage';
import { parseChatSelection } from '@/lib/client/chat-sessions';

// 从路由读取课堂 ID 和聊天会话参数，再交给课堂主体组件加载对应课堂。
function ClassroomDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const stageId = typeof params.id === 'string' ? params.id.toLowerCase() : '';
  // key 让课堂 ID 改变时重建 Stage，避免沿用上一间课堂的页面状态。
  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden"><Stage key={stageId} stageId={stageId}
    chatSelection={parseChatSelection(search.getAll('chatSession'))} chatOpen={search.get('chatOpen') === '1'} /></div>;
}

export default function ClassroomDetailPage() {
  // useSearchParams 可能触发客户端挂起；Suspense 为该页面提供边界。
  return <Suspense><ClassroomDetail /></Suspense>;
}
