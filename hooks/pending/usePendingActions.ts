'use client';

import { useCallback } from 'react';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { TrackPayload } from '@/hooks/dnd/types';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { usePendingStateStore } from './state';
import { getMatchEngine } from '@/lib/matching/matchEngine';

interface EnqueuePendingParams {
  targetPlaylistId: string;
  targetProviderId: MusicProviderId;
  insertPosition: number;
  payloads: TrackPayload[];
}

export function usePendingActions() {
  const addTracks = useAddTracks();
  const addPending = usePendingStateStore((state) => state.addPending);
  const markMatched = usePendingStateStore((state) => state.markMatched);
  const markUnresolved = usePendingStateStore((state) => state.markUnresolved);
  const removePending = usePendingStateStore((state) => state.removePending);

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
  }, [addPending, addTracks, markMatched, markUnresolved, removePending]);

  return {
    enqueuePendingFromBrowseDrop,
  };
}
