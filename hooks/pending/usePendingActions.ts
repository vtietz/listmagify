'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { playlistTracksInfiniteByProvider } from '@/lib/api/queryKeys';
import { applyAddToInfinitePages, applyRemoveToInfinitePages, type InfiniteData } from '@/lib/dnd/sortUtils';
import { usePendingStateStore, toPendingTrackUri } from './state';
import { getMatchEngine } from '@/lib/matching/matchEngine';
import type { MatchCandidate } from '@/lib/matching/providers';

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

  const removePendingTrackFromCache = useCallback((params: {
    providerId: MusicProviderId;
    playlistId: string;
    pendingTrackId: string;
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

      return applyRemoveToInfinitePages(current, [pendingUri]);
    });
  }, [queryClient]);

  const findPendingById = useCallback((pendingId: string) => {
    const byPlaylist = usePendingStateStore.getState().byPlaylist;
    for (const playlistState of Object.values(byPlaylist)) {
      const pending = playlistState.pending.find((item) => item.tempId === pendingId);
      if (pending) {
        return pending;
      }
    }
    return undefined;
  }, []);

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
          if (!findPendingById(pendingTrack.tempId)) {
            return;
          }

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
              if (!findPendingById(pendingTrack.tempId)) {
                return;
              }
              markUnresolved(pendingTrack.tempId, 'Failed to add matched track', candidate);
            },
          });
        },
        onNeedsManualCheck: (candidate, candidates) => {
          if (!findPendingById(pendingTrack.tempId)) {
            return;
          }
          markUnresolved(pendingTrack.tempId, 'Needs manual review', candidate, candidates);
        },
        onUnresolved: (reason, candidates) => {
          if (!findPendingById(pendingTrack.tempId)) {
            return;
          }
          markUnresolved(
            pendingTrack.tempId,
            reason,
            candidates?.[0],
            candidates,
          );
        },
        onError: () => {
          if (!findPendingById(pendingTrack.tempId)) {
            return;
          }
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
    findPendingById,
  ]);

  const cancelPendingById = useCallback((pendingId: string) => {
    const pending = findPendingById(pendingId);
    if (!pending) {
      return;
    }

    const engine = getMatchEngine();
    engine.cancel(pendingId);
    removePending(pendingId);
    removePendingTrackFromCache({
      providerId: pending.targetProvider,
      playlistId: pending.targetPlaylistId,
      pendingTrackId: pendingId,
    });
  }, [findPendingById, removePending, removePendingTrackFromCache]);

  const resolvePendingWithCandidate = useCallback(async (pendingId: string, candidate: MatchCandidate) => {
    const pending = findPendingById(pendingId);
    if (!pending) {
      return;
    }

    const engine = getMatchEngine();
    engine.cancel(pendingId);

    try {
      await addTracks.mutateAsync({
        providerId: pending.targetProvider,
        playlistId: pending.targetPlaylistId,
        trackUris: [candidate.trackUri],
        position: pending.position,
      });

      removePending(pendingId);
    } catch {
      markUnresolved(
        pendingId,
        'Failed to add selected match',
        candidate,
        pending.candidateOptions ?? [candidate],
      );
    }
  }, [addTracks, findPendingById, markUnresolved, removePending]);

  return {
    enqueuePendingFromBrowseDrop,
    cancelPendingById,
    resolvePendingWithCandidate,
  };
}
