/**
 * Hook for executing sequential move operations to reorder a playlist
 * while preserving `added_at` metadata.
 *
 * Each move is a separate API call with snapshot ID chaining for consistency.
 * Supports progress tracking, cancellation, and error handling.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import {
  playlistTracksByProvider,
  playlistTracksInfiniteByProvider,
} from '@/lib/api/queryKeys';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';
import type { MoveStep } from '@/lib/utils/reorderMoves';
import type { MusicProviderId } from '@/lib/music-provider/types';

export type SequentialMoveProgress = {
  current: number;
  total: number;
};

export type SequentialMoveState = {
  isMoving: boolean;
  progress: SequentialMoveProgress | null;
  error: string | null;
};

type ExecuteParams = {
  playlistId: string;
  providerId: MusicProviderId;
  snapshotId: string;
  moves: MoveStep[];
};

const INITIAL_STATE: SequentialMoveState = {
  isMoving: false,
  progress: null,
  error: null,
};

export function useSequentialMoves() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SequentialMoveState>(INITIAL_STATE);
  const cancelledRef = useRef(false);

  const invalidatePlaylist = useCallback(
    (playlistId: string, providerId: MusicProviderId) => {
      queryClient.invalidateQueries({
        queryKey: playlistTracksInfiniteByProvider(playlistId, providerId),
      });
      queryClient.invalidateQueries({
        queryKey: playlistTracksByProvider(playlistId, providerId),
      });
    },
    [queryClient],
  );

  const execute = useCallback(
    async ({ playlistId, providerId, snapshotId, moves }: ExecuteParams): Promise<boolean> => {
      cancelledRef.current = false;
      setState({
        isMoving: true,
        progress: { current: 0, total: moves.length },
        error: null,
      });

      let currentSnapshotId = snapshotId;

      for (let i = 0; i < moves.length; i++) {
        if (cancelledRef.current) {
          setState(INITIAL_STATE);
          invalidatePlaylist(playlistId, providerId);
          toast.info('Reorder cancelled. Playlist partially reordered.');
          return false;
        }

        const move = moves[i]!;

        try {
          const response = await apiFetch<{ snapshotId: string }>(
            `/api/playlists/${playlistId}/reorder?provider=${providerId}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fromIndex: move.fromIndex,
                toIndex: move.toIndex,
                rangeLength: 1,
                snapshotId: currentSnapshotId,
              }),
              suppressErrorDialog: true,
            },
          );

          currentSnapshotId = response.snapshotId;

          setState((prev) => ({
            ...prev,
            progress: { current: i + 1, total: moves.length },
          }));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Move operation failed';

          setState({
            isMoving: false,
            progress: null,
            error: message,
          });

          invalidatePlaylist(playlistId, providerId);
          toast.error(
            `Failed at move ${i + 1}/${moves.length}: ${message}. Playlist partially reordered.`,
          );
          return false;
        }
      }

      // Success — invalidate caches and notify
      setState(INITIAL_STATE);
      invalidatePlaylist(playlistId, providerId);

      eventBus.emit('playlist:update', {
        playlistId,
        providerId,
        cause: 'reorder',
      });

      toast.success('Playlist order saved (dates preserved)');
      return true;
    },
    [invalidatePlaylist],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  return { state, execute, cancel, reset };
}
