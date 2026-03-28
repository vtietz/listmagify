'use client';

import { useQuery } from '@tanstack/react-query';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface AppConfigResponse {
  availableProviders?: MusicProviderId[];
  syncSchedulerEnabled?: boolean;
}

/**
 * Reads public app configuration from /api/config.
 * Shares the same query cache key as useAvailableProviders.
 */
export function useAppConfig(): AppConfigResponse {
  const { data } = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const response = await fetch('/api/config');
      if (!response.ok) {
        return {} satisfies AppConfigResponse;
      }
      return response.json() as Promise<AppConfigResponse>;
    },
    staleTime: Infinity,
  });

  return data ?? {};
}

/**
 * Whether the server-side background sync scheduler is enabled.
 */
export function useSyncSchedulerEnabled(): boolean {
  const config = useAppConfig();
  return config.syncSchedulerEnabled ?? false;
}
