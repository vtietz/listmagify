'use client';

import {
  Shield,
  MessageSquare,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';

// Import admin-related cards from stats
import { AccessRequestsCard } from '@/components/stats/cards/AccessRequestsCard';
import { ErrorReportsCard } from '@/components/stats/cards/ErrorReportsCard';
import { FeedbackStatsCard } from '@/components/stats/cards/FeedbackStatsCard';

/**
 * Admin Section - User management, feedback, error reports
 * 
 * This section contains administrative functions like:
 * - Access request management (approve/reject)
 * - Error reports from users
 * - User feedback (NPS scores, comments)
 * 
 * Note: Admin functions show ALL data (no time filtering)
 * to ensure pending requests/reports are always visible.
 */
export function AdminSection() {
  // Admin functions should show all data, not time-filtered
  const allTimeRange = { from: '1970-01-01', to: '2099-12-31' };
  return (
    <section id="admin" className="scroll-mt-28 space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Shield className="h-6 w-6" />
        Admin
      </h2>

      {/* Access Requests - Most Important */}
      <div>
        <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Access Requests
        </h3>
        <AccessRequestsCard />
      </div>

      {/* Error Reports */}
      <div>
        <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Error Reports
        </h3>
        <ErrorReportsCard dateRange={allTimeRange} />
      </div>

      {/* Feedback */}
      <div>
        <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          User Feedback
        </h3>
        <FeedbackStatsCard dateRange={allTimeRange} isLoading={false} />
      </div>
    </section>
  );
}
