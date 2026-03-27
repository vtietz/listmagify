'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { Track } from '@/lib/music-provider/types';
import type { TrackPayload } from '@features/dnd/model/types';
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
  const matchedInsertQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const matchedInsertBufferRef = useRef<Map<string, Array<{
    pendingId: string;
    targetProviderId: MusicProviderId;
    targetPlaylistId: string;
    position: number;
    candidate: MatchCandidate;
    enqueueOrder: number;
  }>>>(new Map());
  const matchedInsertTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
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

  const processMatchedInsertBatch = useCallback(async (batch: Array<{
    pendingId: string;
    targetProviderId: MusicProviderId;
    targetPlaylistId: string;
    position: number;
    candidate: MatchCandidate;
    enqueueOrder: number;
  }>) => {
    const activeBatch = batch.filter((entry) => findPendingById(entry.pendingId));
    if (activeBatch.length === 0) {
      return;
    }

    const sorted = [...activeBatch].sort((a, b) => {
      const positionDiff = a.position - b.position;
      if (positionDiff !== 0) return positionDiff;
      return a.enqueueOrder - b.enqueueOrder;
    });
    const first = sorted[0];
    if (!first) {
      return;
    }

    try {
      await addTracks.mutateAsync({
        providerId: first.targetProviderId,
        playlistId: first.targetPlaylistId,
        trackUris: sorted.map((entry) => entry.candidate.trackUri),
        position: first.position,
      });

      sorted.forEach((entry) => {
        if (!findPendingById(entry.pendingId)) {
          return;
        }

        markMatched(entry.pendingId);
        removePending(entry.pendingId);
      });
    } catch {
      sorted.forEach((entry) => {
        if (!findPendingById(entry.pendingId)) {
          return;
        }

        markUnresolved(entry.pendingId, 'Failed to add matched track', entry.candidate);
      });
    }
  }, [addTracks, findPendingById, markMatched, markUnresolved, removePending]);

  const enqueueMatchedInsert = useCallback((entry: {
    pendingId: string;
    targetProviderId: MusicProviderId;
    targetPlaylistId: string;
    position: number;
    candidate: MatchCandidate;
    enqueueOrder: number;
  }) => {
    const queueKey = `${entry.targetProviderId}:${entry.targetPlaylistId}`;
    const currentBatch = matchedInsertBufferRef.current.get(queueKey) ?? [];
    matchedInsertBufferRef.current.set(queueKey, [...currentBatch, entry]);

    const existingTimer = matchedInsertTimerRef.current.get(queueKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      matchedInsertTimerRef.current.delete(queueKey);
      const buffered = matchedInsertBufferRef.current.get(queueKey) ?? [];
      matchedInsertBufferRef.current.delete(queueKey);

      const previous = matchedInsertQueueRef.current.get(queueKey) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(async () => {
          await processMatchedInsertBatch(buffered);
        })
        .finally(() => {
          if (matchedInsertQueueRef.current.get(queueKey) === next) {
            matchedInsertQueueRef.current.delete(queueKey);
          }
        });

      matchedInsertQueueRef.current.set(queueKey, next);
    }, 75);

    matchedInsertTimerRef.current.set(queueKey, timer);
  }, [processMatchedInsertBatch]);

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

    pendingTracks.forEach((pendingTrack, enqueueOrder) => {
      engine.enqueue({
        pendingId: pendingTrack.tempId,
        payload: pendingTrack.sourceMeta,
        targetProvider: params.targetProviderId,
        onMatched: async (candidate) => {
          if (!findPendingById(pendingTrack.tempId)) {
            return;
          }

          enqueueMatchedInsert({
            pendingId: pendingTrack.tempId,
            targetProviderId: params.targetProviderId,
            targetPlaylistId: params.targetPlaylistId,
            position: pendingTrack.position,
            candidate,
            enqueueOrder,
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
    markUnresolved,
    upsertPendingTrackInCache,
    findPendingById,
    enqueueMatchedInsert,
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
