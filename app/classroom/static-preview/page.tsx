import { notFound } from 'next/navigation';
import { StaticClassroomPreview } from './preview';

export default function StaticPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <StaticClassroomPreview />;
}
