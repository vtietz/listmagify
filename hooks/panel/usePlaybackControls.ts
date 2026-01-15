/**
 * Hook for track playback controls.
 * 
 * The hook receives two track lists:
 * - sortedTracks: Full sorted list (without text filter) for playback continuity
 * - filteredTracks: Currently visible tracks after text filtering
 * 
 * This ensures that filtering by text doesn't break playback continuity -
 * the auto-advance will continue through the full sorted list regardless
 * of what filtering happens during playback.
 */

'use client';

import { useMemo, useCallback } from 'react';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import type { Track } from '@/lib/spotify/types';

export function usePlaybackControls(
  filteredTracks: Track[],
  playlistId: string | null | undefined,
  isLikedPlaylist: boolean,
  /** Full sorted track list (without text filter) for playback continuity */
  sortedTracks?: Track[]
) {
  // Use sortedTracks (if available) for playback context to maintain continuity
  // when text filtering changes. Fall back to filteredTracks if not provided.
  const playbackTracks = sortedTracks ?? filteredTracks;
  
  const trackUris = useMemo(
    () => playbackTracks.map((t: Track) => t.uri),
    [playbackTracks]
  );

  const playlistUri =
    playlistId && !isLikedPlaylist ? `spotify:playlist:${playlistId}` : undefined;

  const { isTrackPlaying, isTrackLoading, playTrack, pausePlayback } =
    useTrackPlayback({
      trackUris,
      playlistId: playlistId ?? undefined,
      playlistUri,
    });

  // Play first track in the playlist
  const handlePlayFirst = useCallback(async () => {
    if (!filteredTracks.length) return;
    const firstTrack = filteredTracks[0];
    if (firstTrack?.uri) {
      await playTrack(firstTrack.uri);
    }
  }, [filteredTracks, playTrack]);

  return {
    trackUris,
    playlistUri,
    isTrackPlaying,
    isTrackLoading,
    playTrack,
    pausePlayback,
    handlePlayFirst,
  };
}
