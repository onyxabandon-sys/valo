import { notFound } from 'next/navigation';
import { AdminDemoPreview } from '@/components/AdminDemoPreview';

export const dynamic = 'force-dynamic';

export default function LocalPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <AdminDemoPreview />;
}
