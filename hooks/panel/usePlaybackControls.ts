/**
 * Hook for track playback controls.
 */

'use client';

import { useMemo, useCallback } from 'react';
import { useTrackPlayback } from '@/hooks/useTrackPlayback';
import type { Track } from '@/lib/spotify/types';

export function usePlaybackControls(
  filteredTracks: Track[],
  playlistId: string | null | undefined,
  isLikedPlaylist: boolean
) {
  const trackUris = useMemo(
    () => filteredTracks.map((t: Track) => t.uri),
    [filteredTracks]
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
