'use client';

import { useQuery } from '@tanstack/react-query';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { DEFAULT_SYNC_INTERVAL_OPTIONS } from '@/lib/sync/types';
import type { SyncIntervalOption } from '@/lib/sync/types';

interface AppConfigResponse {
  availableProviders?: MusicProviderId[];
  syncSchedulerEnabled?: boolean;
  syncSchedulerTickMs?: number;
  syncIntervalOptions?: SyncIntervalOption[];
  maxSyncTasksPerUser?: number | null;
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

export function useSyncIntervalOptions(): SyncIntervalOption[] {
  const config = useAppConfig();
  return config.syncIntervalOptions?.length
    ? config.syncIntervalOptions
    : [...DEFAULT_SYNC_INTERVAL_OPTIONS];
}

export function useSyncSchedulerTickMs(): number {
  const config = useAppConfig();
  return config.syncSchedulerTickMs ?? 60_000;
}

export function useMaxSyncTasksPerUser(): number | null {
  const config = useAppConfig();
  return config.maxSyncTasksPerUser ?? null;
}
