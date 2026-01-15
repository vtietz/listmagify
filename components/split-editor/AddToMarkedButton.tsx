/**
 * AddToMarkedButton component - Adds a track to all marked insertion points.
 * Appears in TrackRow next to the play button.
 * Shows a confirmation dialog when some markers are in non-visible playlists.
 * Shows a duplicate warning dialog when the track already exists in target playlists.
 */

'use client';

import { Plus, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
import { useSplitGridStore, flattenPanels } from '@/hooks/useSplitGridStore';
import { useAddTracks, useReorderTracks } from '@/lib/spotify/playlistMutations';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { usePlaylistTrackCheck, type DuplicateCheckResult } from '@/hooks/usePlaylistTrackCheck';
import { AddToPlaylistDialog } from '@/components/playlist/AddToPlaylistDialog';
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
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/ui/toast';

interface AddToMarkedButtonProps {
  /** Track URI to add */
  trackUri: string;
  /** Track name for toast messages */
  trackName: string;
  /** Track artists for dialog display */
  trackArtists?: string[];
  /** Optional: exclude this playlist from insertion (e.g., the source playlist) */
  excludePlaylistId?: string;
}

/**
 * Button to add a track to all marked insertion points across playlists.
 * Disabled when there are no active markers.
 * Shows confirmation dialog when some markers are in non-visible playlists.
 * Shows duplicate warning dialog when track already exists in target playlists.
 */
export function AddToMarkedButton({
  trackUri,
  trackName,
  trackArtists = [],
  excludePlaylistId,
}: AddToMarkedButtonProps) {
  const { isCompact } = useCompactModeStore();
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const root = useSplitGridStore((s) => s.root);
  const addTracksMutation = useAddTracks();
  const reorderTracksMutation = useReorderTracks();
  const { checkForAnyDuplicates } = usePlaylistTrackCheck();
  const [isInserting, setIsInserting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    results: DuplicateCheckResult[];
    playlistsWithDuplicates: string[];
  } | null>(null);

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

  // Execute the actual insertion with optional skip for playlists with duplicates
  const executeInsertion = useCallback(async (skipPlaylistIds?: Set<string>) => {
    setIsInserting(true);

    try {
      let insertedCount = 0;
      let skippedCount = 0;

      // Process each playlist's markers
      for (const [playlistId, data] of playlistsWithMarkers) {
        // Skip playlists if requested (user chose to skip duplicates)
        if (skipPlaylistIds?.has(playlistId)) {
          skippedCount += data.markers.length;
          continue;
        }

        const positions = computeInsertionPositions(data.markers, 1);

        // Insert at each position in order (positions are already adjusted for cumulative inserts)
        for (const pos of positions) {
          await addTracksMutation.mutateAsync({
            playlistId,
            trackUris: [trackUri],
            position: pos.effectiveIndex,
          });
          insertedCount++;
        }

        // Update marker indices after all insertions for this playlist
        shiftAfterMultiInsert(playlistId);
      }

      if (skippedCount > 0 && insertedCount > 0) {
        // Success - no toast needed
      } else if (skippedCount > 0) {
        toast.info(`Skipped all ${skippedCount} position${skippedCount > 1 ? 's' : ''} (track already exists)`);
      } else {
        // Success - no toast needed
      }
    } catch (error) {
      toast.error(`Failed to add track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsInserting(false);
    }
  }, [playlistsWithMarkers, trackUri, trackName, addTracksMutation, shiftAfterMultiInsert]);

  // Check for duplicates and show appropriate dialog
  const checkAndProceed = useCallback(async () => {
    const playlistIds = playlistsWithMarkers.map(([id]) => id);
    const { hasDuplicates, results, playlistsWithDuplicates } = checkForAnyDuplicates(
      playlistIds,
      [trackUri]
    );

    if (hasDuplicates) {
      setDuplicateInfo({ results, playlistsWithDuplicates });
      setShowDuplicateDialog(true);
    } else {
      await executeInsertion();
    }
  }, [playlistsWithMarkers, trackUri, checkForAnyDuplicates, executeInsertion]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isInserting) return;

    // If no markers, show playlist dialog
    if (!hasActiveMarkers) {
      setShowPlaylistDialog(true);
      return;
    }

    // Show confirmation dialog if there are markers in hidden playlists
    if (hiddenPlaylistCount > 0) {
      setShowConfirmDialog(true);
    } else {
      await checkAndProceed();
    }
  };

  const handleConfirm = async () => {
    setShowConfirmDialog(false);
    await checkAndProceed();
  };

  // Duplicate dialog handlers
  const handleAddAnyway = async () => {
    setShowDuplicateDialog(false);
    setDuplicateInfo(null);
    await executeInsertion();
  };

  const handleSkipDuplicates = async () => {
    setShowDuplicateDialog(false);
    const skipIds = new Set(duplicateInfo?.playlistsWithDuplicates ?? []);
    setDuplicateInfo(null);
    await executeInsertion(skipIds);
  };

  const handleAbort = () => {
    setShowDuplicateDialog(false);
    setDuplicateInfo(null);
  };

  // Move existing tracks to marker positions (reorder instead of duplicate)
  // For playlists without the track, add it normally
  const handleMoveExisting = async () => {
    setShowDuplicateDialog(false);
    setIsInserting(true);

    try {
      let movedCount = 0;
      let addedCount = 0;

      for (const [playlistId, data] of playlistsWithMarkers) {
        const duplicateResult = duplicateInfo?.results.find(r => r.playlistId === playlistId);
        const positions = computeInsertionPositions(data.markers, 1);
        if (positions.length === 0) continue;

        // If track exists in this playlist, move it to marker position
        if (duplicateResult?.existingPositions?.length) {
          const targetPosition = positions[0]!.effectiveIndex;

          for (const { position: fromIndex } of duplicateResult.existingPositions) {
            // Calculate effective target considering shift from removal
            const effectiveTarget = fromIndex < targetPosition ? targetPosition - 1 : targetPosition;
            
            if (fromIndex !== effectiveTarget) {
              await reorderTracksMutation.mutateAsync({
                playlistId,
                fromIndex,
                toIndex: effectiveTarget,
                rangeLength: 1,
              });
              movedCount++;
            }
          }
        } else {
          // Track doesn't exist in this playlist, add it at marker positions
          for (const pos of positions) {
            await addTracksMutation.mutateAsync({
              playlistId,
              trackUris: [trackUri],
              position: pos.effectiveIndex,
            });
            addedCount++;
          }
          shiftAfterMultiInsert(playlistId);
        }
      }

      if (movedCount > 0 && addedCount > 0) {
        // Success - no toast needed
      } else if (movedCount > 0) {
        // Success - no toast needed
      } else if (addedCount > 0) {
        // Success - no toast needed
      } else {
        toast.info('Tracks are already at the marker positions');
      }
    } catch (error) {
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDuplicateInfo(null);
      setIsInserting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isInserting}
        className={cn(
          'flex items-center justify-center rounded transition-all',
          isCompact ? 'h-5 w-5' : 'h-6 w-6',
          hasActiveMarkers && !isInserting
            ? 'text-orange-500 hover:scale-110 hover:bg-orange-500 hover:text-white'
            : !isInserting
            ? 'text-muted-foreground hover:scale-110 hover:text-foreground'
            : 'text-muted-foreground/30 cursor-not-allowed',
        )}
        title={
          hasActiveMarkers
            ? `Add to ${totalMarkers} marked position${totalMarkers > 1 ? 's' : ''}`
            : 'Add to playlist'
        }
        aria-label={
          hasActiveMarkers
            ? `Add ${trackName} to ${totalMarkers} marked insertion points`
            : 'Add to playlist'
        }
      >
        {isInserting ? (
          <Loader2 className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4', 'animate-spin')} />
        ) : (
          <Plus className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
        )}
      </button>

      {/* Playlist selector dialog (when no markers) */}
      <AddToPlaylistDialog
        isOpen={showPlaylistDialog}
        onClose={() => setShowPlaylistDialog(false)}
        trackUri={trackUri}
        trackName={trackName}
        trackArtists={trackArtists}
        currentPlaylistId={excludePlaylistId ?? null}
      />

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

      {/* Duplicate track warning dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Track already exists
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  &quot;{trackName}&quot; already exists in{' '}
                  <strong>
                    {duplicateInfo?.playlistsWithDuplicates.length ?? 0} playlist
                    {(duplicateInfo?.playlistsWithDuplicates.length ?? 0) > 1 ? 's' : ''}
                  </strong>
                  .
                </p>
                <p className="text-muted-foreground">
                  Choose an action:
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={handleAbort}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleSkipDuplicates}>
              Skip duplicates
            </Button>
            <Button variant="secondary" onClick={handleMoveExisting} className="gap-1">
              <ArrowRight className="h-4 w-4" />
              Move existing
            </Button>
            <Button onClick={handleAddAnyway}>
              Add anyway
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
