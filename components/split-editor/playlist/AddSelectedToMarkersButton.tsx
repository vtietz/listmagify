/**
 * AddSelectedToMarkersButton - Unified button to add selected tracks to all insertion markers
 * 
 * Used in:
 * - Playlist panels (adds selected tracks to markers in other playlists)
 * - Spotify search panel (adds selected search results to markers)
 * - Last.fm browse panel (matches then adds selected tracks to markers)
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useInsertionPointsStore,
  computeInsertionPositions,
  type InsertionPoint,
} from '@features/split-editor/playlist/hooks/useInsertionPointsStore';
import { useSplitGridStore } from '@features/split-editor/stores/useSplitGridStore';
import { usePendingActions } from '@features/split-editor/hooks/usePendingActions';
import type { TrackPayload } from '@features/dnd/model/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { isPlaylistIdCompatibleWithProvider } from '@/lib/providers/playlistIdCompat';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/ui/toast';

interface PlaylistMarkerData {
  markers: InsertionPoint[];
}

type PlaylistMarkerEntry = [string, PlaylistMarkerData];

interface AddTracksMutationLike {
  mutateAsync: (params: {
    playlistId: string;
    trackUris: string[];
    position: number;
    providerId?: MusicProviderId;
  }) => Promise<unknown>;
}

function inferProviderFromPlaylistIdFallback(playlistId: string): MusicProviderId {
  if (isPlaylistIdCompatibleWithProvider(playlistId, 'tidal')) {
    return 'tidal';
  }

  return 'spotify';
}

function resolveTargetProviderId(
  playlistId: string,
  panelProviderByPlaylistId: Map<string, MusicProviderId>,
): MusicProviderId {
  const mappedProviderId = panelProviderByPlaylistId.get(playlistId);
  if (mappedProviderId && isPlaylistIdCompatibleWithProvider(playlistId, mappedProviderId)) {
    return mappedProviderId;
  }

  return inferProviderFromPlaylistIdFallback(playlistId);
}

function inferProviderFromTrackUri(trackUri: string | undefined): MusicProviderId | null {
  if (!trackUri) {
    return null;
  }

  if (trackUri.startsWith('spotify:track:')) {
    return 'spotify';
  }

  if (trackUri.startsWith('tidal:track:')) {
    return 'tidal';
  }

  return null;
}

function getPlaylistsWithMarkers(
  playlists: Record<string, PlaylistMarkerData>,
  excludePlaylistId?: string,
): PlaylistMarkerEntry[] {
  return Object.entries(playlists).filter(([playlistId, data]) => {
    return data.markers.length > 0 && playlistId !== excludePlaylistId;
  });
}

function getTotalMarkers(playlistsWithMarkers: PlaylistMarkerEntry[]): number {
  return playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);
}

async function addUrisToPlaylistMarkers(
  playlistId: string,
  markers: InsertionPoint[],
  uris: string[],
  addTracksMutation: AddTracksMutationLike,
  providerId: MusicProviderId,
): Promise<number> {
  const positions = computeInsertionPositions(markers, uris.length);

  for (const position of positions) {
    await addTracksMutation.mutateAsync({
      playlistId,
      trackUris: uris,
      position: position.effectiveIndex,
      providerId,
    });
  }

  return markers.length;
}

function shouldUsePendingMatchFlow(
  trackPayloads: TrackPayload[],
  uris: string[],
  sourceProviderId: MusicProviderId | null,
  targetProviderId: MusicProviderId,
): boolean {
  if (trackPayloads.length === 0) {
    return false;
  }

  if (uris.length === 0) {
    return true;
  }

  return !!sourceProviderId && sourceProviderId !== targetProviderId;
}

function enqueuePendingForPlaylist(
  playlistId: string,
  markers: InsertionPoint[],
  trackPayloads: TrackPayload[],
  targetProviderId: MusicProviderId,
  enqueueFn: (params: {
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    insertPosition: number;
    payloads: TrackPayload[];
  }) => boolean,
): number {
  const positions = computeInsertionPositions(markers, trackPayloads.length);
  let enqueuedMarkers = 0;

  for (const position of positions) {
    if (enqueueFn({
      targetPlaylistId: playlistId,
      targetProviderId,
      insertPosition: position.effectiveIndex,
      payloads: trackPayloads,
    })) {
      enqueuedMarkers += 1;
    }
  }

  return enqueuedMarkers;
}

async function processPlaylistMarkerEntry(params: {
  playlistId: string;
  playlistData: PlaylistMarkerData;
  uris: string[];
  sourceProviderId: MusicProviderId | null;
  trackPayloads: TrackPayload[];
  panelProviderByPlaylistId: Map<string, MusicProviderId>;
  enqueuePendingFromBrowseDrop: (params: {
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    insertPosition: number;
    payloads: TrackPayload[];
  }) => boolean;
  addTracksMutation: AddTracksMutationLike;
  shiftAfterMultiInsert: (playlistId: string, options?: { tracksPerInsert?: number }) => void;
}): Promise<number> {
  const targetProviderId = resolveTargetProviderId(params.playlistId, params.panelProviderByPlaylistId);
  const usePending = shouldUsePendingMatchFlow(
    params.trackPayloads, params.uris, params.sourceProviderId, targetProviderId,
  );

  let insertedInPlaylist: number;

  if (usePending) {
    insertedInPlaylist = enqueuePendingForPlaylist(
      params.playlistId, params.playlistData.markers, params.trackPayloads,
      targetProviderId, params.enqueuePendingFromBrowseDrop,
    );

    if (insertedInPlaylist === 0) {
      return -1; // Signal error
    }
  } else {
    if (params.uris.length === 0) {
      return -1; // Signal error
    }

    insertedInPlaylist = await addUrisToPlaylistMarkers(
      params.playlistId, params.playlistData.markers, params.uris,
      params.addTracksMutation, targetProviderId,
    );
  }

  if (params.playlistData.markers.length > 1) {
    const tracksPerInsert = usePending ? params.trackPayloads.length : params.uris.length;
    params.shiftAfterMultiInsert(params.playlistId, { tracksPerInsert });
  }

  return insertedInPlaylist;
}

async function addUrisToMarkersAcrossPlaylists(params: {
  playlistsWithMarkers: PlaylistMarkerEntry[];
  uris: string[];
  sourceProviderId: MusicProviderId | null;
  trackPayloads: TrackPayload[];
  panelProviderByPlaylistId: Map<string, MusicProviderId>;
  enqueuePendingFromBrowseDrop: (params: {
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    insertPosition: number;
    payloads: TrackPayload[];
  }) => boolean;
  addTracksMutation: AddTracksMutationLike;
  shiftAfterMultiInsert: (playlistId: string, options?: { tracksPerInsert?: number }) => void;
}): Promise<{ successCount: number; errorCount: number }> {
  let successCount = 0;
  let errorCount = 0;

  for (const [playlistId, playlistData] of params.playlistsWithMarkers) {
    if (playlistData.markers.length === 0) {
      continue;
    }

    try {
      const result = await processPlaylistMarkerEntry({
        playlistId,
        playlistData,
        uris: params.uris,
        sourceProviderId: params.sourceProviderId,
        trackPayloads: params.trackPayloads,
        panelProviderByPlaylistId: params.panelProviderByPlaylistId,
        enqueuePendingFromBrowseDrop: params.enqueuePendingFromBrowseDrop,
        addTracksMutation: params.addTracksMutation,
        shiftAfterMultiInsert: params.shiftAfterMultiInsert,
      });

      if (result < 0) {
        errorCount++;
      } else {
        successCount += result;
      }
    } catch {
      errorCount++;
    }
  }

  return { successCount, errorCount };
}

function showAddResultToast(successCount: number, errorCount: number): void {
  if (successCount > 0 && errorCount === 0) {
    return;
  }

  if (successCount > 0 && errorCount > 0) {
    toast.warning(
      `Added to ${successCount} markers, failed for ${errorCount} playlist${errorCount > 1 ? 's' : ''}`,
    );
    return;
  }

  toast.error('Failed to add tracks to markers');
}

function buildTooltipText(selectedCount: number, hasActiveMarkers: boolean, totalMarkers: number): string {
  if (selectedCount === 0) {
    return 'Select tracks to add to insertion markers';
  }

  if (hasActiveMarkers) {
    return `Add ${selectedCount} track${selectedCount > 1 ? 's' : ''} to ${totalMarkers} marker${totalMarkers > 1 ? 's' : ''}`;
  }

  return 'No insertion markers set. Right-click track rows to add markers.';
}

interface AddSelectedToMarkersButtonProps {
  /** Number of selected tracks to add */
  selectedCount: number;
  /** Get the track URIs to add - called when button is clicked */
  getTrackUris: () => Promise<string[]> | string[];
  /** Optional metadata payloads for cross-provider matching */
  getTrackPayloads?: (() => Promise<TrackPayload[]> | TrackPayload[]) | undefined;
  /** Optional source provider hint for selected tracks */
  sourceProviderId?: MusicProviderId | undefined;
  /** Optional: playlist ID to exclude from markers (e.g., the source playlist) */
  excludePlaylistId?: string;
  /** Optional: custom class name */
  className?: string;
}

export function AddSelectedToMarkersButton({
  selectedCount,
  getTrackUris,
  getTrackPayloads,
  sourceProviderId,
  excludePlaylistId,
  className,
}: AddSelectedToMarkersButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const panels = useSplitGridStore((s) => s.panels);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const addTracksMutation = useAddTracks();
  const { enqueuePendingFromBrowseDrop } = usePendingActions();
  
  // Get all playlists with active markers (excluding source playlist)
  const playlistsWithMarkers = getPlaylistsWithMarkers(playlists, excludePlaylistId);
  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = getTotalMarkers(playlistsWithMarkers);
  const panelProviderByPlaylistId = useMemo(() => {
    const map = new Map<string, MusicProviderId>();

    for (const panel of panels) {
      if (panel.playlistId) {
        map.set(panel.playlistId, panel.providerId);
      }
    }

    return map;
  }, [panels]);
  
  const handleClick = useCallback(async () => {
    if (selectedCount === 0 || !hasActiveMarkers) return;
    
    setIsAdding(true);
    
    try {
      const uris = await getTrackUris();
      const payloads = getTrackPayloads
        ? await getTrackPayloads()
        : [];

      // Need either URIs (same-provider add) or payloads (pending match flow)
      if (uris.length === 0 && payloads.length === 0) {
        toast.error('No tracks to add');
        return;
      }

      const resolvedSourceProviderId = sourceProviderId
        ?? payloads[0]?.sourceProvider
        ?? inferProviderFromTrackUri(uris[0]);

      const { successCount, errorCount } = await addUrisToMarkersAcrossPlaylists({
        playlistsWithMarkers,
        uris,
        sourceProviderId: resolvedSourceProviderId,
        trackPayloads: payloads,
        panelProviderByPlaylistId,
        enqueuePendingFromBrowseDrop,
        addTracksMutation,
        shiftAfterMultiInsert,
      });

      showAddResultToast(successCount, errorCount);
    } catch {
      toast.error('Failed to add tracks');
    } finally {
      setIsAdding(false);
    }
  }, [
    selectedCount,
    hasActiveMarkers,
    getTrackUris,
    getTrackPayloads,
    sourceProviderId,
    playlistsWithMarkers,
    panelProviderByPlaylistId,
    enqueuePendingFromBrowseDrop,
    addTracksMutation,
    shiftAfterMultiInsert,
  ]);
  
  const isDisabled = !hasActiveMarkers || isAdding || selectedCount === 0;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClick}
            disabled={isDisabled}
            className={cn(
              'h-8 w-8 p-0 shrink-0 relative',
              hasActiveMarkers && selectedCount > 0 && 'text-green-500 hover:text-green-600 hover:bg-green-500/10',
              (!hasActiveMarkers || selectedCount === 0) && 'text-muted-foreground',
              className
            )}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {/* Badge showing selected count - only when there's a selection */}
            {selectedCount > 0 && (
              <span 
                className={cn(
                  'absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center',
                  hasActiveMarkers 
                    ? 'bg-green-500 text-white' 
                    : 'bg-muted-foreground/50 text-background'
                )}
              >
                {selectedCount > 99 ? '99+' : selectedCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{buildTooltipText(selectedCount, hasActiveMarkers, totalMarkers)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
