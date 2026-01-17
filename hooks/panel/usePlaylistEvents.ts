/**
 * Hook for playlist event subscriptions (reload, update events).
 * Scroll persistence is handled separately by usePanelScrollSync.
 */

'use client';

import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/sync/eventBus';
import { playlistMeta } from '@/lib/api/queryKeys';

interface UsePlaylistEventsOptions {
  playlistId: string | null | undefined;
  queryClient: QueryClient;
}

export function usePlaylistEvents({
  playlistId,
  queryClient,
}: UsePlaylistEventsOptions) {
  useEffect(() => {
    if (!playlistId) {
      return;
    }

    const unsubscribeUpdate = eventBus.on('playlist:update', () => {});
    const unsubscribeReload = eventBus.on('playlist:reload', ({ playlistId: id }) => {
      if (id === playlistId) {
        // Invalidate queries - scroll restoration is handled by usePanelScrollSync
        // when dataUpdatedAt changes after the queries refetch
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
  }, [playlistId, queryClient]);
}
