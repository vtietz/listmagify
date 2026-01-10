/**
 * Hook for managing duplicate tracks detection and deletion.
 */

'use client';

import { useMemo, useState, useCallback } from 'react';
import { toast } from '@/lib/ui/toast';
import { buildDuplicateUris, buildSelectedDuplicateUris } from './panelUtils';
import type { Track } from '@/lib/spotify/types';

interface UseDuplicatesOptions {
  playlistId: string | null | undefined;
  isEditable: boolean;
  filteredTracks: Track[];
  selection: Set<string>;
  removeTracks: {
    mutateAsync: (params: {
      playlistId: string;
      tracks: Array<{ uri: string; position?: number; positions?: number[] }>;
      snapshotId?: string;
    }) => Promise<void>;
  };
}

export function useDuplicates({
  playlistId,
  isEditable,
  filteredTracks,
  selection,
  removeTracks,
}: UseDuplicatesOptions) {
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);

  // Detect duplicate URIs in the track list
  const duplicateUris = useMemo(
    () => buildDuplicateUris(filteredTracks),
    [filteredTracks]
  );

  // Compute which duplicate URIs are currently selected
  const selectedDuplicateUris = useMemo(
    () => buildSelectedDuplicateUris(selection, filteredTracks, duplicateUris),
    [selection, filteredTracks, duplicateUris]
  );

  // Check if a URI is a duplicate
  const isDuplicate = useCallback(
    (uri: string) => duplicateUris.has(uri),
    [duplicateUris]
  );

  // Check if another instance of this URI is selected
  const isOtherInstanceSelected = useCallback(
    (uri: string) => selectedDuplicateUris.has(uri),
    [selectedDuplicateUris]
  );

  // Delete all duplicate tracks, keeping only first occurrence
  const handleDeleteAllDuplicates = useCallback(async () => {
    if (!playlistId || !isEditable || isDeletingDuplicates) return;

    setIsDeletingDuplicates(true);
    try {
      // Build a map of track URI -> list of positions
      const uriPositions = new Map<string, number[]>();
      filteredTracks.forEach((track, index) => {
        const position = track.position ?? index;
        const positions = uriPositions.get(track.uri) || [];
        positions.push(position);
        uriPositions.set(track.uri, positions);
      });

      // Find all positions to remove (keep first occurrence)
      const positionsToRemove: Array<{ uri: string; position: number }> = [];
      for (const [uri, positions] of uriPositions) {
        if (positions.length > 1) {
          for (let i = 1; i < positions.length; i++) {
            positionsToRemove.push({ uri, position: positions[i]! });
          }
        }
      }

      if (positionsToRemove.length === 0) {
        toast.success('No duplicates found');
        return;
      }

      await removeTracks.mutateAsync({
        playlistId,
        tracks: positionsToRemove,
      });

      toast.success(
        `Removed ${positionsToRemove.length} duplicate track${positionsToRemove.length > 1 ? 's' : ''}`
      );
    } catch (error) {
      console.error('[handleDeleteAllDuplicates] Failed:', error);
      toast.error('Failed to delete duplicates');
    } finally {
      setIsDeletingDuplicates(false);
    }
  }, [playlistId, isEditable, isDeletingDuplicates, filteredTracks, removeTracks]);

  // Delete duplicates of a specific track (keep the selected instance)
  const handleDeleteTrackDuplicates = useCallback(
    async (track: Track, keepPosition: number) => {
      if (!playlistId || !isEditable) return;

      // Find all instances of this track
      const duplicatePositions: number[] = [];
      filteredTracks.forEach((t, index) => {
        const position = t.position ?? index;
        if (t.uri === track.uri && position !== keepPosition) {
          duplicatePositions.push(position);
        }
      });

      if (duplicatePositions.length === 0) {
        toast.info('No other instances of this track found');
        return;
      }

      try {
        await removeTracks.mutateAsync({
          playlistId,
          tracks: duplicatePositions.map((position) => ({
            uri: track.uri,
            position,
          })),
        });

        toast.success(
          `Removed ${duplicatePositions.length} duplicate${duplicatePositions.length > 1 ? 's' : ''} of "${track.name}"`
        );
      } catch (error) {
        console.error('[handleDeleteTrackDuplicates] Failed:', error);
        toast.error('Failed to delete duplicates');
      }
    },
    [playlistId, isEditable, filteredTracks, removeTracks]
  );

  return {
    duplicateUris,
    selectedDuplicateUris,
    isDuplicate,
    isOtherInstanceSelected,
    isDeletingDuplicates,
    handleDeleteAllDuplicates,
    handleDeleteTrackDuplicates,
  };
}
