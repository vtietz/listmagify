'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { playlistTracksInfiniteByProvider } from '@/lib/api/queryKeys';
import { applyAddToInfinitePages, type InfiniteData } from '@/lib/dnd/sortUtils';
import { usePendingStateStore, toPendingTrackUri } from './state';
import { getMatchEngine } from '@/lib/matching/matchEngine';

type PlaylistTracksPage = {
  tracks: Track[];
  snapshotId: string;
  total: number;
  nextCursor: string | null;
};

interface EnqueuePendingParams {
  targetPlaylistId: string;
  targetProviderId: MusicProviderId;
  insertPosition: number;
  payloads: TrackPayload[];
}

export function usePendingActions() {
  const queryClient = useQueryClient();
  const addTracks = useAddTracks();
  const addPending = usePendingStateStore((state) => state.addPending);
  const markMatched = usePendingStateStore((state) => state.markMatched);
  const markUnresolved = usePendingStateStore((state) => state.markUnresolved);
  const removePending = usePendingStateStore((state) => state.removePending);

  const upsertPendingTrackInCache = useCallback((params: {
    providerId: MusicProviderId;
    playlistId: string;
    pendingTrackId: string;
    payload: TrackPayload;
    position: number;
  }) => {
    if (!queryClient) {
      return;
    }

    const queryKey = playlistTracksInfiniteByProvider(params.playlistId, params.providerId);
    const pendingUri = toPendingTrackUri(params.pendingTrackId);

    queryClient.setQueryData(queryKey, (current: InfiniteData<PlaylistTracksPage> | undefined) => {
      if (!current) {
        return current;
      }

      const syntheticTrack: Track = {
        id: null,
        uri: pendingUri,
        name: params.payload.title,
        artists: params.payload.artists,
        durationMs: Math.max(0, params.payload.durationSec * 1000),
        position: params.position,
        album: params.payload.album
          ? {
              name: params.payload.album,
              image: params.payload.coverUrl ? { url: params.payload.coverUrl } : null,
              releaseDate: params.payload.year ? String(params.payload.year) : null,
              releaseDatePrecision: params.payload.year ? 'year' : null,
            }
          : null,
      };

      return applyAddToInfinitePages(current, [syntheticTrack], params.position);
    });
  }, [queryClient]);

  const enqueuePendingFromBrowseDrop = useCallback((params: EnqueuePendingParams): boolean => {
    if (params.payloads.length === 0) {
      return false;
    }

    const pendingTracks = addPending({
      targetPlaylistId: params.targetPlaylistId,
      targetProvider: params.targetProviderId,
      sourcePanel: 'browse',
      position: params.insertPosition,
      payloads: params.payloads,
    });

    pendingTracks.forEach((pendingTrack) => {
      upsertPendingTrackInCache({
        providerId: params.targetProviderId,
        playlistId: params.targetPlaylistId,
        pendingTrackId: pendingTrack.tempId,
        payload: pendingTrack.sourceMeta,
        position: pendingTrack.position,
      });
    });

    const engine = getMatchEngine();

    pendingTracks.forEach((pendingTrack) => {
      engine.enqueue({
        pendingId: pendingTrack.tempId,
        payload: pendingTrack.sourceMeta,
        targetProvider: params.targetProviderId,
        onMatched: async (candidate) => {
          addTracks.mutate({
            providerId: params.targetProviderId,
            playlistId: params.targetPlaylistId,
            trackUris: [candidate.trackUri],
            position: pendingTrack.position,
          }, {
            onSuccess: () => {
              markMatched(pendingTrack.tempId);
              // Don't remove the synthetic track from cache manually.
              // The addTracks mutation triggers invalidateQueries which refetches
              // server data — that refetch atomically replaces the cache,
              // swapping the pending placeholder for the real track without layout shift.
              removePending(pendingTrack.tempId);
            },
            onError: () => {
              markUnresolved(pendingTrack.tempId, 'Failed to add matched track', candidate);
            },
          });
        },
        onNeedsManualCheck: (candidate) => {
          markUnresolved(pendingTrack.tempId, 'Needs manual review', candidate);
        },
        onUnresolved: (reason) => {
          markUnresolved(pendingTrack.tempId, reason);
        },
        onError: () => {
          markUnresolved(pendingTrack.tempId, 'Matching request failed');
        },
      });
    });

    return true;
  }, [
    addPending,
    addTracks,
    markMatched,
    markUnresolved,
    removePending,
    upsertPendingTrackInCache,
  ]);

  return {
    enqueuePendingFromBrowseDrop,
  };
}
