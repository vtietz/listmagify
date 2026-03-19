/**
 * Hook for track playback integration in TrackRow components.
 * Provides callbacks and state for play button functionality.
 */

import { useCallback, useState, useRef } from 'react';
import { useProviderPlayer } from './useSpotifyPlayer';
import { useMusicProviderId } from './useMusicProviderId';

interface UseTrackPlaybackOptions {
  /** All track URIs in the current playlist (for auto-play next) */
  trackUris: string[];
  /** Playlist ID (optional, for context) */
  playlistId?: string | undefined;
  /** Playlist URI (optional, for provider context playback) */
  playlistUri?: string | undefined;
  /** Source identifier (e.g., 'search', 'lastfm', or panel ID) for tracking playback origin */
  sourceId?: string | undefined;
}

export function useTrackPlayback(options: UseTrackPlaybackOptions) {
  const { trackUris, playlistId, playlistUri, sourceId } = options;
  const { play, pause, isPlaying, currentTrackId, isLoading } = useProviderPlayer();
  const providerId = useMusicProviderId();
  const isPlaybackSupported = providerId === 'spotify';
  
  // Track which track we're loading (for showing spinner)
  const [loadingTrackUri, setLoadingTrackUri] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // Check if a specific track is currently playing
  const isTrackPlaying = useCallback((trackId: string | null) => {
    if (!isPlaybackSupported) return false;
    if (!trackId || !currentTrackId) return false;
    return trackId === currentTrackId && isPlaying;
  }, [isPlaybackSupported, currentTrackId, isPlaying]);

  // Check if we're loading playback for a specific track
  const isTrackLoading = useCallback((trackUri: string) => {
    if (!isPlaybackSupported) return false;
    return loadingTrackUri === trackUri && loadingRef.current;
  }, [isPlaybackSupported, loadingTrackUri]);

  // Play a specific track
  const playTrack = useCallback(async (trackUri: string) => {
    if (!isPlaybackSupported) {
      return;
    }

    if (loadingRef.current) return;
    
    setLoadingTrackUri(trackUri);
    loadingRef.current = true;
    
    try {
      // Find the track index in the list (used for local context tracking)
      const trackIndex = trackUris.indexOf(trackUri);
      
      // If we have a playlist context URI, use it for proper provider queue management.
      // IMPORTANT: Use URI offset instead of position offset to handle sorted/filtered views
      // Position offset refers to provider playlist order, but our trackUris may be sorted differently
      if (playlistUri && trackIndex >= 0) {
        await play({
          contextUri: playlistUri,
          offset: { uri: trackUri },
          playlistTrackUris: trackUris,
          currentIndex: trackIndex,
          ...(playlistId ? { playlistId } : {}),
          ...(sourceId ? { sourceId } : {}),
        });
      } else {
        // For Liked Songs or other non-playlist contexts:
        // Just play the single track and store context for manual next/previous
        // Don't send all URIs to avoid 413 Payload Too Large
        await play({
          trackUri: trackUri,
          playlistTrackUris: trackUris,
          currentIndex: trackIndex >= 0 ? trackIndex : 0,
          ...(playlistId ? { playlistId } : {}),
          ...(sourceId ? { sourceId } : {}),
        });
      }
    } finally {
      loadingRef.current = false;
      setLoadingTrackUri(null);
    }
  }, [isPlaybackSupported, trackUris, playlistUri, playlistId, sourceId, play]);

  // Pause playback
  const pausePlayback = useCallback(async () => {
    if (!isPlaybackSupported) {
      return;
    }

    await pause();
  }, [isPlaybackSupported, pause]);

  return {
    /** Check if a specific track is currently playing */
    isTrackPlaying,
    /** Check if we're loading playback for a specific track */
    isTrackLoading,
    /** Start playing a track by URI */
    playTrack,
    /** Pause current playback */
    pausePlayback,
    /** Current playing track ID (null if none) */
    currentTrackId,
    /** Global playback loading state */
    isLoading,
  };
}
