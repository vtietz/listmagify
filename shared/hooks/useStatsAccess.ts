'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Hook to check if the current user has access to stats.
 * Makes a lightweight API call to verify access without exposing allowlist.
 */
export function useStatsAccess() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats-access'],
    queryFn: async () => {
      try {
        // Try to access stats API - middleware will return 403 if not allowed
        const res = await fetch('/api/stats/overview?from=2000-01-01&to=2000-01-02');
        return res.ok;
      } catch {
        return false;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  });

  return {
    hasAccess: data ?? false,
    isLoading,
  };
}
