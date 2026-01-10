/**
 * Hook for fetching Last.fm configuration status.
 */

'use client';

import { useQuery } from '@tanstack/react-query';

export function useLastfmConfig() {
  const { data: lastfmConfig } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/lastfm/status');
        if (!response.ok) return { enabled: false };
        const data = await response.json();
        return { enabled: data.enabled === true };
      } catch {
        return { enabled: false };
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  return {
    lastfmEnabled: lastfmConfig?.enabled ?? false,
  };
}
