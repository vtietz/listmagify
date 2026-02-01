import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/auth';
import { AdminDashboard } from '@/components/admin';
import { Shield } from 'lucide-react';
import { isUserAllowedForStats } from '@/lib/metrics/env';

export const metadata = {
  title: 'Admin',
};

/**
 * Admin Dashboard Page
 * 
 * Protected by STATS_ALLOWED_USER_IDS check.
 * Combines admin functions and usage analytics for admin users only.
 */
export default async function AdminPage() {
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
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage access requests, view feedback, and monitor app usage
          </p>
        </div>
      </div>
      
      <AdminDashboard />
    </div>
  );
}
