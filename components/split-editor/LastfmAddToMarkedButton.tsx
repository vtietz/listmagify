/**
 * LastfmAddToMarkedButton - Add Last.fm track to insertion markers with matching
 * 
 * Unlike the regular AddToMarkedButton, this component:
 * 1. First matches the Last.fm track to Spotify if not already matched
 * 2. Only then adds to the insertion markers
 */

'use client';

import { Plus, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore, computeInsertionPositions } from '@/hooks/useInsertionPointsStore';
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

/**
 * Button to add a Last.fm track to all marked insertion points.
 * First matches the track to Spotify, then inserts at all markers.
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
  const playlistsWithMarkers = Object.entries(playlists)
    .filter(([, data]) => data.markers.length > 0);

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
      // Step 1: Match the track if not already matched
      let match: CachedMatch | undefined = cached;
      
      if (!match || match.status === 'idle' || match.status === 'pending') {
        match = await matchTrack(lastfmTrack);
      }

      // Check if match was successful
      if (match.status !== 'matched' || !match.spotifyTrack) {
        toast.error(`Could not find "${trackName}" on Spotify`);
        setIsInserting(false);
        return;
      }

      // Check confidence level
      if (match.confidence === 'low' || match.confidence === 'none') {
        toast.error(`Low confidence match for "${trackName}" - please verify manually`);
        setIsInserting(false);
        return;
      }

      const trackUri = match.spotifyTrack.uri;

      // Step 2: Insert at each playlist's markers
      for (const [playlistId, data] of playlistsWithMarkers) {
        const positions = computeInsertionPositions(data.markers, 1);

        for (const pos of positions) {
          await addTracksMutation.mutateAsync({
            playlistId,
            trackUris: [trackUri],
            position: pos.effectiveIndex,
          });
        }

        // Shift markers after multi-insert
        if (data.markers.length > 1) {
          shiftAfterMultiInsert(playlistId);
        }
      }

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
