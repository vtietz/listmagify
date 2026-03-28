'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface ProviderUserResponse {
  id: string;
  displayName: string | null;
}

/**
 * Fetches the current user's provider-specific user ID.
 * Cached for 10 minutes since provider user IDs don't change.
 */
export function useProviderUserId(providerId: MusicProviderId) {
  const { data } = useQuery({
    queryKey: ['provider-user', providerId],
    queryFn: () => apiFetch<ProviderUserResponse>(`/api/me?provider=${providerId}`),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return data?.id ?? undefined;
}
