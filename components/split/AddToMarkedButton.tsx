/**
 * AddToMarkedButton component - Adds a track to all marked insertion points.
 * Appears in TrackRow next to the play button.
 */

'use client';

import { Plus, Loader2 } from 'lucide-react';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { cn } from '@/lib/utils';
import { useState } from 'react';
// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

interface AddToMarkedButtonProps {
  /** Track URI to add */
  trackUri: string;
  /** Track name for toast messages */
  trackName: string;
  /** Optional: exclude this playlist from insertion (e.g., the source playlist) */
  excludePlaylistId?: string;
}

/**
 * Button to add a track to all marked insertion points across playlists.
 * Disabled when there are no active markers.
 */
export function AddToMarkedButton({
  trackUri,
  trackName,
  excludePlaylistId,
}: AddToMarkedButtonProps) {
  const { isCompact } = useCompactModeStore();
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  const [isInserting, setIsInserting] = useState(false);

  // Get all playlists with active markers (excluding the source if specified)
  const playlistsWithMarkers = Object.entries(playlists)
    .filter(([playlistId, data]) => {
      if (excludePlaylistId && playlistId === excludePlaylistId) return false;
      return data.markers.length > 0;
    });

  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!hasActiveMarkers || isInserting) return;

    setIsInserting(true);

    try {
      // Process each playlist's markers
      for (const [playlistId, data] of playlistsWithMarkers) {
        const positions = computeInsertionPositions(data.markers, 1);

        // Insert at each position in order (positions are already adjusted for cumulative inserts)
        for (const pos of positions) {
          await addTracksMutation.mutateAsync({
            playlistId,
            trackUris: [trackUri],
            position: pos.effectiveIndex,
          });
        }

        // Update marker indices after all insertions for this playlist
        // shiftAfterMultiInsert shifts marker[i] by (i+1) which accounts for
        // cumulative insertions: marker 0 shifts by 1, marker 1 shifts by 2, etc.
        shiftAfterMultiInsert(playlistId);
      }

      toast.success(`Added "${trackName}" to ${totalMarkers} position${totalMarkers > 1 ? 's' : ''}`);
    } catch (error) {
      toast.error(`Failed to add track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsInserting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!hasActiveMarkers || isInserting}
      className={cn(
        'flex items-center justify-center rounded transition-all',
        isCompact ? 'h-5 w-5' : 'h-6 w-6',
        hasActiveMarkers && !isInserting
          ? 'text-orange-500 hover:scale-110 hover:bg-orange-500 hover:text-white'
          : 'text-muted-foreground/30 cursor-not-allowed',
      )}
      title={
        hasActiveMarkers
          ? `Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`
          : 'No insertion points marked'
      }
      aria-label={
        hasActiveMarkers
          ? `Add ${trackName} to ${totalMarkers} marked insertion points`
          : 'Add to marked insertion points (no markers set)'
      }
    >
      {isInserting ? (
        <Loader2 className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4', 'animate-spin')} />
      ) : (
        <Plus className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
      )}
    </button>
  );
}
