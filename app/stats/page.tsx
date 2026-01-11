import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/auth';
import { StatsDashboard } from '@/components/stats';
import { BarChart3 } from 'lucide-react';
import { isUserAllowedForStats } from '@/lib/metrics/env';

export const metadata = {
  title: 'Stats',
};

/**
 * Stats Dashboard Page
 * 
 * Protected by STATS_ALLOWED_USER_IDS check.
 * Shows usage analytics for admin users only.
 */
export default async function StatsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Check if user is in the allowlist
  const userId = session.user?.id;
  if (!isUserAllowedForStats(userId)) {
    redirect('/playlists?reason=unauthorized');
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Usage Statistics</h1>
          <p className="text-muted-foreground">
            Privacy-preserving analytics for Listmagify
          </p>
        </div>
      </div>
      
      <StatsDashboard />
    </div>
  );
}
