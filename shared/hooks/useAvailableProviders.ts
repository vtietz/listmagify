'use client';

import { useQuery } from '@tanstack/react-query';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface AppConfigResponse {
  availableProviders?: MusicProviderId[];
}

export function useAvailableProviders(): MusicProviderId[] {
  const { data } = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const response = await fetch('/api/config');
      if (!response.ok) {
        return { availableProviders: ['spotify'] } satisfies AppConfigResponse;
      }

      return response.json() as Promise<AppConfigResponse>;
    },
    staleTime: Infinity,
  });

  const providers = data?.availableProviders;
  if (!providers || providers.length === 0) {
    return ['spotify'];
  }

  return providers;
}
