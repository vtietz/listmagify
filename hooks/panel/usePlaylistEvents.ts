/**
 * Hook for playlist event subscriptions (reload, update events).
 * Note: Scroll save is now handled by usePanelScrollSync.
 */

'use client';

import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/sync/eventBus';
import { playlistMeta } from '@/lib/api/queryKeys';

interface UsePlaylistEventsOptions {
  panelId: string;
  playlistId: string | null | undefined;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  setScroll: (panelId: string, scrollTop: number) => void;
  queryClient: QueryClient;
}

export function usePlaylistEvents({
  panelId,
  playlistId,
  scrollRef,
  setScroll,
  queryClient,
}: UsePlaylistEventsOptions) {
  useEffect(() => {
    if (!playlistId) {
      return;
    }

    const unsubscribeUpdate = eventBus.on('playlist:update', () => {});
    const unsubscribeReload = eventBus.on('playlist:reload', ({ playlistId: id }) => {
      if (id === playlistId) {
        // Save current scroll position before invalidating
        const scrollTop = scrollRef.current?.scrollTop || 0;
        setScroll(panelId, scrollTop);
        // Invalidate queries
        queryClient.invalidateQueries({
          queryKey: ['playlist-tracks-infinite', playlistId],
        });
        queryClient.invalidateQueries({ queryKey: playlistMeta(playlistId) });
      }
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeReload();
    };
  }, [playlistId, panelId, queryClient, setScroll, scrollRef]);
}
