'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Stage } from '@/components/stage';
import { parseChatSelection } from '@/lib/client/chat-sessions';

function ClassroomDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const stageId = typeof params.id === 'string' ? params.id.toLowerCase() : '';
  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden"><Stage key={stageId} stageId={stageId}
    chatSelection={parseChatSelection(search.getAll('chatSession'))} chatOpen={search.get('chatOpen') === '1'} /></div>;
}

export default function ClassroomDetailPage() {
  return <Suspense><ClassroomDetail /></Suspense>;
}
