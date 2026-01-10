/**
 * Hook for automatic playlist reload at configured intervals.
 */

'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { eventBus } from '@/lib/sync/eventBus';

export function useAutoReload(
  playlistId: string | null | undefined,
  isLikedPlaylist: boolean
) {
  const { data: configData } = useQuery({
    queryKey: ['app-config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      if (!res.ok) return { playlistPollIntervalSeconds: null };
      return res.json() as Promise<{ playlistPollIntervalSeconds: number | null }>;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const intervalSeconds = configData?.playlistPollIntervalSeconds;
    if (!intervalSeconds || !playlistId || isLikedPlaylist) return;
    const intervalId = setInterval(() => {
      eventBus.emit('playlist:reload', { playlistId });
    }, intervalSeconds * 1000);
    return () => clearInterval(intervalId);
  }, [configData?.playlistPollIntervalSeconds, playlistId, isLikedPlaylist]);
}
