/**
 * Hook for automatic playlist reload at configured intervals.
 * 
 * Uses reference counting to ensure only ONE timer runs per playlist,
 * even if multiple panels have the same playlist open. This prevents
 * duplicate API calls when the same playlist is displayed in multiple panels.
 */

'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { eventBus } from '@/lib/sync/eventBus';

// Track active timers per playlist to avoid duplicates
// Key: playlistId, Value: { refCount: number, intervalId: NodeJS.Timeout | null }
const activeTimers = new Map<string, { refCount: number; intervalId: ReturnType<typeof setInterval> | null }>();

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

    // Get or create timer entry for this playlist
    let timerEntry = activeTimers.get(playlistId);
    
    if (!timerEntry) {
      // First panel with this playlist - create new timer
      const intervalId = setInterval(() => {
        eventBus.emit('playlist:reload', { playlistId });
      }, intervalSeconds * 1000);
      
      timerEntry = { refCount: 1, intervalId };
      activeTimers.set(playlistId, timerEntry);
    } else {
      // Another panel has this playlist - just increment ref count
      timerEntry.refCount++;
    }

    return () => {
      const entry = activeTimers.get(playlistId);
      if (!entry) return;
      
      entry.refCount--;
      
      if (entry.refCount <= 0) {
        // Last panel with this playlist closed - clear timer
        if (entry.intervalId) {
          clearInterval(entry.intervalId);
        }
        activeTimers.delete(playlistId);
      }
    };
  }, [configData?.playlistPollIntervalSeconds, playlistId, isLikedPlaylist]);
}
