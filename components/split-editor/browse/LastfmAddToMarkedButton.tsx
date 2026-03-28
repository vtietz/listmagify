/**
 * LastfmAddToMarkedButton - Add Last.fm track to insertion markers via pending match flow
 *
 * Builds a TrackPayload from the Last.fm DTO and enqueues it through
 * enqueuePendingFromBrowseDrop, same as browse search tracks.
 */

'use client';

import { Plus, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useCompactModeStore } from '@features/split-editor/stores/useCompactModeStore';
import {
  useInsertionPointsStore,
  computeInsertionPositions,
  type InsertionPoint,
} from '@features/split-editor/playlist/hooks/useInsertionPointsStore';
import { useSplitGridStore } from '@features/split-editor/stores/useSplitGridStore';
import { usePendingActions } from '@features/split-editor/hooks/usePendingActions';
import { lastfmDtoToTrackPayload } from '@features/split-editor/browse/hooks/useLastfmTracks';
import { isPlaylistIdCompatibleWithProvider } from '@/lib/providers/playlistIdCompat';
import { toast } from '@/lib/ui/toast';
import type { ImportedTrackDTO } from '@/lib/importers/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface LastfmAddToMarkedButtonProps {
  lastfmTrack: ImportedTrackDTO;
  trackName: string;
}

interface PlaylistMarkerData {
  markers: InsertionPoint[];
}

type PlaylistsWithMarkers = Array<[string, PlaylistMarkerData]>;

function getPlaylistsWithMarkers(playlists: Record<string, PlaylistMarkerData>): PlaylistsWithMarkers {
  return Object.entries(playlists).filter(([, data]) => data.markers.length > 0);
}

function resolveTargetProvider(playlistId: string, panels: Array<{ playlistId: string | null; providerId: MusicProviderId }>): MusicProviderId {
  const panel = panels.find((p) => p.playlistId === playlistId);
  if (panel?.providerId) {
    return panel.providerId;
  }

  if (isPlaylistIdCompatibleWithProvider(playlistId, 'tidal')) {
    return 'tidal';
  }

  return 'spotify';
}

export function LastfmAddToMarkedButton({
  lastfmTrack,
  trackName,
}: LastfmAddToMarkedButtonProps) {
  const { isCompact } = useCompactModeStore();
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const panels = useSplitGridStore((s) => s.panels);
  const { enqueuePendingFromBrowseDrop } = usePendingActions();
  const [isInserting, setIsInserting] = useState(false);

  const playlistsWithMarkers = getPlaylistsWithMarkers(playlists);
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!hasActiveMarkers || isInserting) return;

    setIsInserting(true);

    try {
      const payload = lastfmDtoToTrackPayload(lastfmTrack);

      for (const [playlistId, data] of playlistsWithMarkers) {
        const targetProviderId = resolveTargetProvider(playlistId, panels);
        const positions = computeInsertionPositions(data.markers, 1);

        for (const pos of positions) {
          enqueuePendingFromBrowseDrop({
            targetPlaylistId: playlistId,
            targetProviderId,
            insertPosition: pos.effectiveIndex,
            payloads: [payload],
          });
        }

        if (data.markers.length > 1) {
          shiftAfterMultiInsert(playlistId, { tracksPerInsert: 1 });
        }
      }
    } catch (error) {
      console.error('[LastfmAddToMarkedButton] Error:', error);
      toast.error(`Failed to add "${trackName}"`);
    } finally {
      setIsInserting(false);
    }
  }, [
    hasActiveMarkers,
    isInserting,
    lastfmTrack,
    playlistsWithMarkers,
    panels,
    enqueuePendingFromBrowseDrop,
    shiftAfterMultiInsert,
    trackName,
  ]);

  if (!hasActiveMarkers) {
    return null;
  }

  return (
    <button
      onClick={handleClick}
      disabled={isInserting}
      className={cn(
        'flex items-center justify-center transition-colors',
        isInserting
          ? 'text-muted-foreground cursor-wait'
          : 'text-muted-foreground hover:text-primary hover:scale-110',
      )}
      title={
        isInserting
          ? 'Adding...'
          : `Add to ${totalMarkers} marker${totalMarkers > 1 ? 's' : ''}`
      }
      aria-label={`Add to ${totalMarkers} insertion marker${totalMarkers > 1 ? 's' : ''}`}
    >
      {isInserting ? (
        <Loader2 className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4', 'animate-spin')} />
      ) : (
        <Plus className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4')} />
      )}
    </button>
  );
}
