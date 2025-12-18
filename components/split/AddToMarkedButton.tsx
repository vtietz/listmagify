/**
 * AddToMarkedButton component - Adds a track to all marked insertion points.
 * Appears in TrackRow next to the play button.
 * Shows a confirmation dialog when some markers are in non-visible playlists.
 */

'use client';

import { Plus, Loader2 } from 'lucide-react';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useSplitGridStore, flattenPanels } from '@/hooks/useSplitGridStore';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
 * Shows confirmation dialog when some markers are in non-visible playlists.
 */
export function AddToMarkedButton({
  trackUri,
  trackName,
  excludePlaylistId,
}: AddToMarkedButtonProps) {
  const { isCompact } = useCompactModeStore();
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const root = useSplitGridStore((s) => s.root);
  const addTracksMutation = useAddTracks();
  const [isInserting, setIsInserting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Get all playlists with active markers (excluding the source if specified)
  const playlistsWithMarkers = Object.entries(playlists)
    .filter(([playlistId, data]) => {
      if (excludePlaylistId && playlistId === excludePlaylistId) return false;
      return data.markers.length > 0;
    });

  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  // Get visible playlist IDs from the split grid
  const visiblePlaylistIds = new Set(
    flattenPanels(root)
      .filter((panel) => panel.playlistId)
      .map((panel) => panel.playlistId as string)
  );

  // Find playlists with markers that are NOT currently visible
  const hiddenPlaylistsWithMarkers = playlistsWithMarkers.filter(
    ([playlistId]) => !visiblePlaylistIds.has(playlistId)
  );
  const hiddenPlaylistCount = hiddenPlaylistsWithMarkers.length;
  const hiddenMarkerCount = hiddenPlaylistsWithMarkers.reduce(
    (sum, [, data]) => sum + data.markers.length,
    0
  );

  // Execute the actual insertion
  const executeInsertion = useCallback(async () => {
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
        shiftAfterMultiInsert(playlistId);
      }

      toast.success(`Added "${trackName}" to ${totalMarkers} position${totalMarkers > 1 ? 's' : ''}`);
    } catch (error) {
      toast.error(`Failed to add track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsInserting(false);
    }
  }, [playlistsWithMarkers, trackUri, trackName, totalMarkers, addTracksMutation, shiftAfterMultiInsert]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!hasActiveMarkers || isInserting) return;

    // Show confirmation dialog if there are markers in hidden playlists
    if (hiddenPlaylistCount > 0) {
      setShowConfirmDialog(true);
    } else {
      await executeInsertion();
    }
  };

  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    await executeInsertion();
  };

  return (
    <>
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

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add to hidden playlists?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to add &quot;{trackName}&quot; to{' '}
              <strong>{totalMarkers} marker position{totalMarkers > 1 ? 's' : ''}</strong>.
              <br /><br />
              <span className="text-orange-500 font-medium">
                {hiddenMarkerCount} marker{hiddenMarkerCount > 1 ? 's' : ''} in{' '}
                {hiddenPlaylistCount} playlist{hiddenPlaylistCount > 1 ? 's' : ''}{' '}
                {hiddenPlaylistCount > 1 ? 'are' : 'is'} not currently visible.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Add to all {totalMarkers} positions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
