'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { eventBus } from '@/lib/sync/eventBus';
import { useSyncActivityStore } from '@features/sync/stores/useSyncActivityStore';
import { SYNC_PAIRS_KEY } from '@features/sync/hooks/useSyncPairs';
import type { SyncPairWithRun } from '@features/sync/hooks/useSyncPairs';
import { playlistTracksByProvider } from '@/lib/api/queryKeys';
import type { SyncPair } from '@/lib/sync/types';

const DEBOUNCE_MS = 2000;

/**
 * Global hook that listens for playlist changes and automatically
 * triggers sync for any auto-sync pairs that include the changed playlist.
 *
 * Must be mounted once at the app shell level.
 */
export function useAutoSyncRunner() {
  const queryClient = useQueryClient();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Set<string>());
  const pendingResync = useRef(new Set<string>());

  const incrementActive = useSyncActivityStore((s) => s.incrementActive);
  const decrementActive = useSyncActivityStore((s) => s.decrementActive);

  const executeSyncForPair = useCallback(async (pair: SyncPair) => {
    const pairId = pair.id;

    if (inFlight.current.has(pairId)) {
      pendingResync.current.add(pairId);
      return;
    }

    inFlight.current.add(pairId);
    incrementActive();

    try {
      await apiFetch('/api/sync/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProvider: pair.sourceProvider,
          sourcePlaylistId: pair.sourcePlaylistId,
          targetProvider: pair.targetProvider,
          targetPlaylistId: pair.targetPlaylistId,
          direction: pair.direction,
          syncPairId: pair.id,
        }),
      });

      // Invalidate track caches for both playlists
      queryClient.invalidateQueries({
        queryKey: playlistTracksByProvider(pair.targetPlaylistId, pair.targetProvider),
      });
      queryClient.invalidateQueries({
        queryKey: playlistTracksByProvider(pair.sourcePlaylistId, pair.sourceProvider),
      });
      // Refresh sync pairs (to update latestRun)
      queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
    } catch (err) {
      console.error('[auto-sync] Failed to sync pair', pairId, err);
    } finally {
      inFlight.current.delete(pairId);
      decrementActive();

      // Re-sync if new edits arrived during execution
      if (pendingResync.current.has(pairId)) {
        pendingResync.current.delete(pairId);
        // Re-fetch pair data as it may have changed
        const pairs = queryClient.getQueryData<SyncPairWithRun[]>(SYNC_PAIRS_KEY);
        const freshPair = pairs?.find((p) => p.id === pairId);
        if (freshPair?.autoSync) {
          void executeSyncForPair(freshPair);
        }
      }
    }
  }, [queryClient, incrementActive, decrementActive]);

  useEffect(() => {
    const currentTimers = timers.current;

    const unsubscribe = eventBus.on('playlist:update', (event) => {
      // Skip sync-originated events to prevent circular syncs
      if (event.syncOriginated) return;

      const pairs = queryClient.getQueryData<SyncPairWithRun[]>(SYNC_PAIRS_KEY);
      if (!pairs) return;

      // Find auto-sync pairs that include this playlist
      const matchingPairs = pairs.filter((pair) =>
        pair.autoSync && (
          (pair.sourcePlaylistId === event.playlistId && pair.sourceProvider === event.providerId) ||
          (pair.targetPlaylistId === event.playlistId && pair.targetProvider === event.providerId)
        ),
      );

      for (const pair of matchingPairs) {
        // Clear existing debounce timer for this pair
        const existingTimer = currentTimers.get(pair.id);
        if (existingTimer) clearTimeout(existingTimer);

        // Set new debounce timer
        currentTimers.set(pair.id, setTimeout(() => {
          currentTimers.delete(pair.id);
          void executeSyncForPair(pair);
        }, DEBOUNCE_MS));
      }
    });

    return () => {
      unsubscribe();
      // Clear all timers on unmount
      for (const timer of currentTimers.values()) {
        clearTimeout(timer);
      }
      currentTimers.clear();
    };
  }, [queryClient, executeSyncForPair]);
}
