'use client';

import { useParams } from 'next/navigation';
import { Stage } from '@/components/stage';

export default function ClassroomDetailPage() {
  const params = useParams<{ id: string }>();
  const stageId = typeof params.id === 'string' ? params.id.toLowerCase() : '';
  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden"><Stage key={stageId} stageId={stageId} /></div>;
}
