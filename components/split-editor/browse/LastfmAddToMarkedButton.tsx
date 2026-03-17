/**
 * LastfmAddToMarkedButton - Add Last.fm track to insertion markers with matching
 * 
 * Unlike the regular AddToMarkedButton, this component:
 * 1. First matches the Last.fm track to a provider track if not already matched
 * 2. Only then adds to the insertion markers
 */

'use client';

import { Plus, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import {
  useInsertionPointsStore,
  computeInsertionPositions,
  type InsertionPoint,
} from '@/hooks/useInsertionPointsStore';
import { useLastfmMatch, type CachedMatch } from '@/hooks/useLastfmMatchCache';
import { useAddTracks } from '@/lib/spotify/playlistMutations';
import { toast } from '@/lib/ui/toast';
import type { ImportedTrackDTO } from '@/lib/importers/types';

interface LastfmAddToMarkedButtonProps {
  /** Last.fm track DTO to match and add */
  lastfmTrack: ImportedTrackDTO;
  /** Track name for toast messages */
  trackName: string;
}

interface PlaylistMarkerData {
  markers: InsertionPoint[];
}

type PlaylistsWithMarkers = Array<[string, PlaylistMarkerData]>;

function getPlaylistsWithMarkers(playlists: Record<string, PlaylistMarkerData>): PlaylistsWithMarkers {
  return Object.entries(playlists).filter(([, data]) => data.markers.length > 0);
}

function buildMatchFailureMessage(trackName: string, reason: 'not-found' | 'low-confidence'): string {
  if (reason === 'low-confidence') {
    return `Low confidence match for "${trackName}" - please verify manually`;
  }

  return `Could not find "${trackName}" from provider search`;
}

async function ensureMatchedTrackUri(params: {
  cached: CachedMatch | undefined;
  matchTrack: (dto: ImportedTrackDTO) => Promise<CachedMatch>;
  lastfmTrack: ImportedTrackDTO;
  trackName: string;
}): Promise<{ trackUri?: string; error?: string }> {
  let match: CachedMatch | undefined = params.cached;

  if (!match || match.status === 'idle' || match.status === 'pending') {
    match = await params.matchTrack(params.lastfmTrack);
  }

  const matchedTrack = match.matchedTrack ?? match.spotifyTrack;
  if (match.status !== 'matched' || !matchedTrack) {
    return { error: buildMatchFailureMessage(params.trackName, 'not-found') };
  }

  if (match.confidence === 'low' || match.confidence === 'none') {
    return { error: buildMatchFailureMessage(params.trackName, 'low-confidence') };
  }

  return { trackUri: matchedTrack.uri };
}

async function addTrackToAllMarkers(params: {
  playlistsWithMarkers: PlaylistsWithMarkers;
  trackUri: string;
  addTracksMutation: ReturnType<typeof useAddTracks>;
  shiftAfterMultiInsert: (playlistId: string) => void;
}): Promise<void> {
  for (const [playlistId, data] of params.playlistsWithMarkers) {
    const positions = computeInsertionPositions(data.markers, 1);

    for (const pos of positions) {
      await params.addTracksMutation.mutateAsync({
        playlistId,
        trackUris: [params.trackUri],
        position: pos.effectiveIndex,
      });
    }

    if (data.markers.length > 1) {
      params.shiftAfterMultiInsert(playlistId);
    }
  }
}

/**
 * Button to add a Last.fm track to all marked insertion points.
 * First matches the track to a provider track, then inserts at all markers.
 */
export function LastfmAddToMarkedButton({
  lastfmTrack,
  trackName,
}: LastfmAddToMarkedButtonProps) {
  const { isCompact } = useCompactModeStore();
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const shiftAfterMultiInsert = useInsertionPointsStore((s) => s.shiftAfterMultiInsert);
  const { matchTrack, getCachedMatch } = useLastfmMatch();
  const addTracksMutation = useAddTracks();
  const [isInserting, setIsInserting] = useState(false);

  // Get all playlists with active markers
  const playlistsWithMarkers = getPlaylistsWithMarkers(playlists);

  const hasActiveMarkers = playlistsWithMarkers.length > 0;
  const totalMarkers = playlistsWithMarkers.reduce((sum, [, data]) => sum + data.markers.length, 0);

  // Check current match status
  const cached = getCachedMatch(lastfmTrack);
  const isMatching = cached?.status === 'pending';

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!hasActiveMarkers || isInserting || isMatching) return;

    setIsInserting(true);

    try {
      const { trackUri, error } = await ensureMatchedTrackUri({
        cached,
        matchTrack,
        lastfmTrack,
        trackName,
      });

      if (!trackUri) {
        toast.error(error ?? `Could not match "${trackName}"`);
        return;
      }

      await addTrackToAllMarkers({
        playlistsWithMarkers,
        trackUri,
        addTracksMutation,
        shiftAfterMultiInsert,
      });

      // Success - no toast needed

    } catch (error) {
      console.error('[LastfmAddToMarkedButton] Error:', error);
      toast.error(`Failed to add "${trackName}"`);
    } finally {
      setIsInserting(false);
    }
  }, [
    hasActiveMarkers,
    isInserting,
    isMatching,
    cached,
    matchTrack,
    lastfmTrack,
    trackName,
    playlistsWithMarkers,
    addTracksMutation,
    shiftAfterMultiInsert,
  ]);

  // Don't render if no markers
  if (!hasActiveMarkers) {
    return null;
  }

  const isLoading = isInserting || isMatching;

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'flex items-center justify-center transition-colors',
        isLoading 
          ? 'text-muted-foreground cursor-wait'
          : 'text-muted-foreground hover:text-primary hover:scale-110',
      )}
      title={
        isLoading
          ? 'Matching and adding...'
          : `Add to ${totalMarkers} marker${totalMarkers > 1 ? 's' : ''}`
      }
      aria-label={`Add to ${totalMarkers} insertion marker${totalMarkers > 1 ? 's' : ''}`}
    >
      {isLoading ? (
        <Loader2 className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4', 'animate-spin')} />
      ) : (
        <Plus className={cn(isCompact ? 'h-3 w-3' : 'h-4 w-4')} />
      )}
    </button>
  );
}
