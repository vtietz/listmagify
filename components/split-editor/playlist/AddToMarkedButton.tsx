/**
 * AddToMarkedButton component - Adds a track to all marked insertion points.
 * Appears in TrackRow next to the play button.
 * Shows a confirmation dialog when some markers are in non-visible playlists.
 * Shows a duplicate warning dialog when the track already exists in target playlists.
 */

'use client';

import { Plus, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  useInsertionPointsStore,
  computeInsertionPositions,
  type InsertionPoint,
} from '@/hooks/useInsertionPointsStore';
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

interface PlaylistMarkerData {
  markers: InsertionPoint[];
}

type PlaylistsWithMarkers = Array<[string, PlaylistMarkerData]>;

type AddClickAction = 'ignore' | 'open-playlist-dialog' | 'open-confirm-dialog' | 'proceed';

interface DuplicateInfoState {
  results: DuplicateCheckResult[];
  playlistsWithDuplicates: string[];
}

function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) {
    return singular;
  }

  return plural ?? `${singular}s`;
}

function getPlaylistsWithMarkers(playlists: Record<string, PlaylistMarkerData>): PlaylistsWithMarkers {
  return Object.entries(playlists).filter(([, data]) => data.markers.length > 0);
}

function getAddClickAction(
  isInserting: boolean,
  hasActiveMarkers: boolean,
  hiddenPlaylistCount: number,
): AddClickAction {
  if (isInserting) {
    return 'ignore';
  }

  if (!hasActiveMarkers) {
    return 'open-playlist-dialog';
  }

  if (hiddenPlaylistCount > 0) {
    return 'open-confirm-dialog';
  }

  return 'proceed';
}

function getHiddenMarkerSummary(
  playlistsWithMarkers: PlaylistsWithMarkers,
  visiblePlaylistIds: Set<string>,
): { hiddenPlaylistCount: number; hiddenMarkerCount: number } {
  const hiddenPlaylistsWithMarkers = playlistsWithMarkers.filter(
    ([playlistId]) => !visiblePlaylistIds.has(playlistId),
  );

  return {
    hiddenPlaylistCount: hiddenPlaylistsWithMarkers.length,
    hiddenMarkerCount: hiddenPlaylistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0),
  };
}

function buildButtonClassName(
  isCompact: boolean,
  hasActiveMarkers: boolean,
  isInserting: boolean,
): string {
  return cn(
    'flex items-center justify-center rounded transition-all',
    isCompact ? 'h-5 w-5' : 'h-6 w-6',
    hasActiveMarkers && !isInserting
      ? 'text-orange-500 hover:scale-110 hover:bg-orange-500 hover:text-white'
      : !isInserting
        ? 'text-muted-foreground hover:scale-110 hover:text-foreground'
        : 'text-muted-foreground/30 cursor-not-allowed',
  );
}

function buildButtonTitle(hasActiveMarkers: boolean, totalMarkers: number): string {
  if (!hasActiveMarkers) {
    return 'Add to playlist';
  }

  return `Add to ${totalMarkers} marked ${pluralize(totalMarkers, 'position')}`;
}

function buildButtonAriaLabel(hasActiveMarkers: boolean, totalMarkers: number, trackName: string): string {
  if (!hasActiveMarkers) {
    return 'Add to playlist';
  }

  return `Add ${trackName} to ${totalMarkers} marked insertion points`;
}

async function addTrackToMarkerPositions(params: {
  playlistId: string;
  markers: InsertionPoint[];
  trackUri: string;
  addTracksMutation: ReturnType<typeof useAddTracks>;
  shiftAfterMultiInsert: (playlistId: string) => void;
}): Promise<number> {
  const positions = computeInsertionPositions(params.markers, 1);

  for (const position of positions) {
    await params.addTracksMutation.mutateAsync({
      playlistId: params.playlistId,
      trackUris: [params.trackUri],
      position: position.effectiveIndex,
    });
  }

  params.shiftAfterMultiInsert(params.playlistId);
  return positions.length;
}

async function moveExistingTracksInPlaylist(params: {
  playlistId: string;
  existingPositions: Array<{ position: number }>;
  targetPosition: number;
  reorderTracksMutation: ReturnType<typeof useReorderTracks>;
}): Promise<number> {
  let movedCount = 0;

  for (const { position: fromIndex } of params.existingPositions) {
    const effectiveTarget = fromIndex < params.targetPosition ? params.targetPosition - 1 : params.targetPosition;

    if (fromIndex === effectiveTarget) {
      continue;
    }

    await params.reorderTracksMutation.mutateAsync({
      playlistId: params.playlistId,
      fromIndex,
      toIndex: effectiveTarget,
      rangeLength: 1,
    });
    movedCount++;
  }

  return movedCount;
}

function findDuplicateResult(
  duplicateInfo: DuplicateInfoState | null,
  playlistId: string,
): DuplicateCheckResult | undefined {
  return duplicateInfo?.results.find((result) => result.playlistId === playlistId);
}

async function moveOrAddForPlaylist(params: {
  playlistId: string;
  playlistData: PlaylistMarkerData;
  duplicateInfo: DuplicateInfoState | null;
  trackUri: string;
  addTracksMutation: ReturnType<typeof useAddTracks>;
  reorderTracksMutation: ReturnType<typeof useReorderTracks>;
  shiftAfterMultiInsert: (playlistId: string) => void;
}): Promise<{ movedCount: number; addedCount: number }> {
  const positions = computeInsertionPositions(params.playlistData.markers, 1);
  if (positions.length === 0) {
    return { movedCount: 0, addedCount: 0 };
  }

  const duplicateResult = findDuplicateResult(params.duplicateInfo, params.playlistId);
  if (duplicateResult?.existingPositions?.length) {
    const movedCount = await moveExistingTracksInPlaylist({
      playlistId: params.playlistId,
      existingPositions: duplicateResult.existingPositions,
      targetPosition: positions[0]!.effectiveIndex,
      reorderTracksMutation: params.reorderTracksMutation,
    });
    return { movedCount, addedCount: 0 };
  }

  const addedCount = await addTrackToMarkerPositions({
    playlistId: params.playlistId,
    markers: params.playlistData.markers,
    trackUri: params.trackUri,
    addTracksMutation: params.addTracksMutation,
    shiftAfterMultiInsert: params.shiftAfterMultiInsert,
  });
  return { movedCount: 0, addedCount };
}

async function moveOrAddAcrossPlaylists(params: {
  playlistsWithMarkers: PlaylistsWithMarkers;
  duplicateInfo: DuplicateInfoState | null;
  trackUri: string;
  addTracksMutation: ReturnType<typeof useAddTracks>;
  reorderTracksMutation: ReturnType<typeof useReorderTracks>;
  shiftAfterMultiInsert: (playlistId: string) => void;
}): Promise<{ movedCount: number; addedCount: number }> {
  let movedCount = 0;
  let addedCount = 0;

  for (const [playlistId, playlistData] of params.playlistsWithMarkers) {
    const playlistResult = await moveOrAddForPlaylist({
      playlistId,
      playlistData,
      duplicateInfo: params.duplicateInfo,
      trackUri: params.trackUri,
      addTracksMutation: params.addTracksMutation,
      reorderTracksMutation: params.reorderTracksMutation,
      shiftAfterMultiInsert: params.shiftAfterMultiInsert,
    });
    movedCount += playlistResult.movedCount;
    addedCount += playlistResult.addedCount;
  }

  return { movedCount, addedCount };
}

function AddButtonIcon({ isInserting, isCompact }: { isInserting: boolean; isCompact: boolean }) {
  if (isInserting) {
    return <Loader2 className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4', 'animate-spin')} />;
  }

  return <Plus className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />;
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
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfoState | null>(null);

  // Get all playlists with active markers
  const playlistsWithMarkers = getPlaylistsWithMarkers(playlists);

  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  // Get visible playlist IDs from the split grid
  const visiblePlaylistIds = new Set(
    flattenPanels(root)
      .filter((panel) => panel.playlistId)
      .map((panel) => panel.playlistId as string)
  );

  const { hiddenPlaylistCount, hiddenMarkerCount } = getHiddenMarkerSummary(
    playlistsWithMarkers,
    visiblePlaylistIds,
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
  }, [playlistsWithMarkers, trackUri, addTracksMutation, shiftAfterMultiInsert]);

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

    const action = getAddClickAction(isInserting, hasActiveMarkers, hiddenPlaylistCount);
    switch (action) {
      case 'ignore':
        return;
      case 'open-playlist-dialog':
        setShowPlaylistDialog(true);
        return;
      case 'open-confirm-dialog':
        setShowConfirmDialog(true);
        return;
      case 'proceed':
        await checkAndProceed();
        return;
      default:
        return;
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
      const { movedCount, addedCount } = await moveOrAddAcrossPlaylists({
        playlistsWithMarkers,
        duplicateInfo,
        trackUri,
        addTracksMutation,
        reorderTracksMutation,
        shiftAfterMultiInsert,
      });

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
        className={buildButtonClassName(isCompact, hasActiveMarkers, isInserting)}
        title={buildButtonTitle(hasActiveMarkers, totalMarkers)}
        aria-label={buildButtonAriaLabel(hasActiveMarkers, totalMarkers, trackName)}
      >
        <AddButtonIcon isInserting={isInserting} isCompact={isCompact} />
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
              <strong>{totalMarkers} marker {pluralize(totalMarkers, 'position')}</strong>.
              <br /><br />
              <span className="text-orange-500 font-medium">
                {hiddenMarkerCount} {pluralize(hiddenMarkerCount, 'marker')} in{' '}
                {hiddenPlaylistCount} {pluralize(hiddenPlaylistCount, 'playlist')}{' '}
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
                    {duplicateInfo?.playlistsWithDuplicates.length ?? 0}{' '}
                    {pluralize(duplicateInfo?.playlistsWithDuplicates.length ?? 0, 'playlist')}
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
