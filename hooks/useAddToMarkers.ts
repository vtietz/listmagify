/**
 * useAddToMarkers - Hook to add tracks to all active insertion markers
 * 
 * Extracts the core logic from AddSelectedToMarkersButton for reuse
 * in context menus and other components.
 */

import { useState, useCallback, useMemo } from 'react';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useSplitGridStore } from '@/hooks/useSplitGridStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { isPlaylistIdCompatibleWithProvider } from '@/lib/providers/playlistIdCompat';
import { toast } from '@/lib/ui/toast';
import type { InsertionPoint } from '@/hooks/useInsertionPointsStore';
import type { MusicProviderId } from '@/lib/music-provider/types';

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
  providerId,
  addTracksMutation,
  shiftAfterMultiInsert,
}: {
  playlistId: string;
  playlistData: { markers: InsertionPoint[] };
  uris: string[];
  providerId: MusicProviderId;
  addTracksMutation: ReturnType<typeof useAddTracks>;
  shiftAfterMultiInsert: (playlistId: string, options?: { tracksPerInsert?: number }) => void;
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
      providerId,
    });
  }

  if (playlistData.markers.length > 1) {
    shiftAfterMultiInsert(playlistId, { tracksPerInsert: uris.length });
  }

  return playlistData.markers.length;
}

function inferProviderFromPlaylistId(playlistId: string): MusicProviderId {
  if (isPlaylistIdCompatibleWithProvider(playlistId, 'tidal')) {
    return 'tidal';
  }

  return 'spotify';
}

function resolveProviderForPlaylist(
  playlistId: string,
  panelProviderByPlaylistId: Map<string, MusicProviderId>,
): MusicProviderId {
  const mappedProviderId = panelProviderByPlaylistId.get(playlistId);
  if (mappedProviderId && isPlaylistIdCompatibleWithProvider(playlistId, mappedProviderId)) {
    return mappedProviderId;
  }

  return inferProviderFromPlaylistId(playlistId);
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
  const panels = useSplitGridStore((s) => s.panels);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  const panelProviderByPlaylistId = useMemo(() => {
    const map = new Map<string, MusicProviderId>();

    for (const panel of panels) {
      if (panel.playlistId) {
        map.set(panel.playlistId, panel.providerId);
      }
    }

    return map;
  }, [panels]);
  
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
          const providerId = resolveProviderForPlaylist(playlistId, panelProviderByPlaylistId);
          successCount += await addTracksAtMarkers({
            playlistId,
            playlistData,
            uris,
            providerId,
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
  }, [hasActiveMarkers, playlistsWithMarkers, panelProviderByPlaylistId, addTracksMutation, shiftAfterMultiInsert]);
  
  return {
    isAdding,
    hasActiveMarkers,
    totalMarkers,
    addToMarkers,
  };
}
