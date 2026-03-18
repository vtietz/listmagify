/**
 * useAddToMarkers - Hook to add tracks to all active insertion markers
 * 
 * Extracts the core logic from AddSelectedToMarkersButton for reuse
 * in context menus and other components.
 */

import { useState, useCallback, useMemo } from 'react';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { toast } from '@/lib/ui/toast';
import type { InsertionPoint } from '@/hooks/useInsertionPointsStore';

interface UseAddToMarkersOptions {
  /** Playlist ID to exclude from markers (e.g., the source playlist) */
  excludePlaylistId?: string | undefined;
}

interface UseAddToMarkersResult {
  /** Whether tracks are currently being added */
  isAdding: boolean;
  /** Whether there are any active markers to add to */
  hasActiveMarkers: boolean;
  /** Total number of markers across all playlists */
  totalMarkers: number;
  /** Add tracks to all markers */
  addToMarkers: (uris: string[]) => Promise<void>;
}

async function addTracksAtMarkers({
  playlistId,
  playlistData,
  uris,
  addTracksMutation,
  shiftAfterMultiInsert,
}: {
  playlistId: string;
  playlistData: { markers: InsertionPoint[] };
  uris: string[];
  addTracksMutation: ReturnType<typeof useAddTracks>;
  shiftAfterMultiInsert: (playlistId: string) => void;
}): Promise<number> {
  if (playlistData.markers.length === 0) {
    return 0;
  }

  const positions = computeInsertionPositions(playlistData.markers, uris.length);
  for (const position of positions) {
    await addTracksMutation.mutateAsync({
      playlistId,
      trackUris: uris,
      position: position.effectiveIndex,
    });
  }

  if (playlistData.markers.length > 1) {
    shiftAfterMultiInsert(playlistId);
  }

  return playlistData.markers.length;
}

function showMarkerAddResultToast(successCount: number, errorCount: number) {
  if (successCount > 0 && errorCount === 0) {
    return;
  }

  if (successCount > 0 && errorCount > 0) {
    toast.warning(
      `Added to ${successCount} markers, failed for ${errorCount} playlist${errorCount > 1 ? 's' : ''}`
    );
    return;
  }

  toast.error('Failed to add tracks to markers');
}

export function useAddToMarkers(options: UseAddToMarkersOptions = {}): UseAddToMarkersResult {
  const { excludePlaylistId } = options;
  const [isAdding, setIsAdding] = useState(false);
  
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  
  // Get all playlists with active markers (excluding source playlist)
  const playlistsWithMarkers = useMemo(() => {
    return Object.entries(playlists)
      .filter(([playlistId, data]) => 
        data.markers.length > 0 && playlistId !== excludePlaylistId
      );
  }, [playlists, excludePlaylistId]);
  
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);
  
  const addToMarkers = useCallback(async (uris: string[]) => {
    if (uris.length === 0 || !hasActiveMarkers) return;
    
    setIsAdding(true);
    
    try {
      // Add to each playlist's markers
      let successCount = 0;
      let errorCount = 0;
      
      for (const [playlistId, playlistData] of playlistsWithMarkers) {
        try {
          successCount += await addTracksAtMarkers({
            playlistId,
            playlistData,
            uris,
            addTracksMutation,
            shiftAfterMultiInsert,
          });
        } catch (error) {
          console.error(`Failed to add tracks to playlist ${playlistId}:`, error);
          errorCount++;
        }
      }

      showMarkerAddResultToast(successCount, errorCount);
    } catch (error) {
      console.error('Failed to add tracks to markers:', error);
      toast.error('Failed to add tracks');
    } finally {
      setIsAdding(false);
    }
  }, [hasActiveMarkers, playlistsWithMarkers, addTracksMutation, shiftAfterMultiInsert]);
  
  return {
    isAdding,
    hasActiveMarkers,
    totalMarkers,
    addToMarkers,
  };
}
