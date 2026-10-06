import { AdminDashboard } from '@/components/AdminDashboard';
import { ConvexClientProvider } from '@/components/ConvexClientProvider';

export default function Page() {
  return <ConvexClientProvider><AdminDashboard /></ConvexClientProvider>;
}
