/**
 * Hook for playlist event subscriptions (reload, update events).
 * Scroll persistence is handled separately by usePanelScrollSync.
 */

'use client';

import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/sync/eventBus';
import {
  playlistMetaByProvider,
  playlistTracksInfiniteByProvider,
} from '@/lib/api/queryKeys';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface UsePlaylistEventsOptions {
  playlistId: string | null | undefined;
  providerId: MusicProviderId;
  queryClient: QueryClient;
}

export function usePlaylistEvents({
  playlistId,
  providerId,
  queryClient,
}: UsePlaylistEventsOptions) {
  useEffect(() => {
    if (!playlistId) {
      return;
    }

    const unsubscribeUpdate = eventBus.on('playlist:update', ({ playlistId: id, providerId: eventProviderId }) => {
      if (id !== playlistId || eventProviderId !== providerId) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: playlistMetaByProvider(playlistId, providerId) });
      queryClient.invalidateQueries({
        queryKey: playlistTracksInfiniteByProvider(playlistId, providerId),
      });
    });
    const unsubscribeReload = eventBus.on('playlist:reload', ({ playlistId: id, providerId: eventProviderId }) => {
      if (id === playlistId && eventProviderId === providerId) {
        // Invalidate queries - scroll restoration is handled by usePanelScrollSync
        // when dataUpdatedAt changes after the queries refetch
        queryClient.invalidateQueries({
          queryKey: playlistTracksInfiniteByProvider(playlistId, providerId),
        });
        queryClient.invalidateQueries({ queryKey: playlistMetaByProvider(playlistId, providerId) });
      }
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeReload();
    };
  }, [playlistId, providerId, queryClient]);
}
