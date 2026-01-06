/**
 * Hook for Spotify playback control.
 * Provides methods to play, pause, skip, and manage playback.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { usePlayerStore, type PlaybackContext } from './usePlayerStore';
import { useSessionUser } from './useSessionUser';
import type { SpotifyDevice, PlaybackState } from '@/lib/spotify/playerTypes';

// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

const POLL_INTERVAL = 5000; // Poll playback state every 5 seconds

interface DevicesResponse {
  devices: SpotifyDevice[];
}

interface PlaybackResponse {
  playback: PlaybackState | null;
}

interface ControlResponse {
  success?: boolean;
  error?: string;
  message?: string;
}

export function useSpotifyPlayer() {
  const queryClient = useQueryClient();
  const { authenticated } = useSessionUser();
  const {
    playbackState,
    devices,
    selectedDeviceId,
    isDeviceSelectorOpen,
    playbackContext,
    isLoading,
    error,
    isPlayerVisible,
    webPlayerDeviceId,
    isWebPlayerReady,
    setPlaybackState,
    setDevices,
    setSelectedDevice,
    setDeviceSelectorOpen,
    setPlaybackContext,
    setLoading,
    setError,
    setPlayerVisible,
    togglePlayerVisible,
    currentTrackId,
  } = usePlayerStore();

  // Track if component is mounted
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch playback state - only when authenticated
  const playbackQuery = useQuery({
    queryKey: ['spotify-playback-state'],
    queryFn: async (): Promise<PlaybackState | null> => {
      const data = await apiFetch<PlaybackResponse>('/api/player/state');
      return data.playback;
    },
    enabled: authenticated,
    refetchInterval: authenticated ? POLL_INTERVAL : false,
    staleTime: 2000,
    retry: false, // Don't retry on auth errors
  });

  // Sync playback state to store
  useEffect(() => {
    if (playbackQuery.data !== undefined) {
      setPlaybackState(playbackQuery.data);
    }
  }, [playbackQuery.data, setPlaybackState]);

  // Track the last played track URI to detect track changes
  const lastTrackUriRef = useRef<string | null>(null);
  const autoPlayInProgressRef = useRef(false);

  // Auto-play next track when current track ends (for non-context playback like Liked Songs)
  // This effect monitors playback state and triggers next track when:
  // 1. We have a stored playlist context (trackUris)
  // 2. There's no Spotify context (so Spotify won't auto-advance)
  // 3. The track has ended (not playing, progress near end)
  useEffect(() => {
    const state = playbackQuery.data;
    if (!state || !playbackContext || autoPlayInProgressRef.current) return;
    
    // Only auto-advance if there's no Spotify context (playlists handle this themselves)
    if (state.context?.uri) return;
    
    const track = state.track;
    if (!track) return;
    
    // Detect if track has changed (Spotify advanced or user clicked different track)
    const currentUri = track.uri;
    if (lastTrackUriRef.current && lastTrackUriRef.current !== currentUri) {
      // Track changed - update our context index to match
      const newIndex = playbackContext.trackUris.indexOf(currentUri);
      if (newIndex >= 0 && newIndex !== playbackContext.currentIndex) {
        setPlaybackContext({
          ...playbackContext,
          currentIndex: newIndex,
        });
      }
    }
    lastTrackUriRef.current = currentUri;
    
    // Check if track has ended: not playing AND progress is very close to duration
    // Use a threshold to account for polling delay
    const hasEnded = !state.isPlaying && 
                     track.durationMs > 0 && 
                     state.progressMs >= track.durationMs - 1000; // Within last second
    
    if (hasEnded && playbackContext.currentIndex < playbackContext.trackUris.length - 1) {
      // Play next track
      const nextIndex = playbackContext.currentIndex + 1;
      const nextTrackUri = playbackContext.trackUris[nextIndex];
      
      if (nextTrackUri) {
        autoPlayInProgressRef.current = true;
        
        // Use the control mutation directly to avoid circular dependencies
        apiFetch<ControlResponse>('/api/player/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'play',
            deviceId: selectedDeviceId || undefined,
            uris: [nextTrackUri],
          }),
        }).then(() => {
          setPlaybackContext({
            ...playbackContext,
            currentIndex: nextIndex,
          });
          // Refetch playback state
          queryClient.invalidateQueries({ queryKey: ['spotify-playback-state'] });
        }).catch((err) => {
          console.error('[auto-play next] Failed:', err);
        }).finally(() => {
          autoPlayInProgressRef.current = false;
        });
      }
    }
  }, [playbackQuery.data, playbackContext, selectedDeviceId, setPlaybackContext, queryClient]);

  // Fetch available devices - only when authenticated
  const devicesQuery = useQuery({
    queryKey: ['spotify-devices'],
    queryFn: async (): Promise<SpotifyDevice[]> => {
      const data = await apiFetch<DevicesResponse>('/api/player/devices');
      return data.devices ?? [];
    },
    enabled: authenticated,
    staleTime: 10000,
    retry: false,
  });

  // Sync devices to store
  useEffect(() => {
    if (devicesQuery.data) {
      setDevices(devicesQuery.data);
      
      // Auto-select active device if none selected
      if (!selectedDeviceId) {
        const activeDevice = devicesQuery.data.find((d: SpotifyDevice) => d.isActive);
        if (activeDevice) {
          setSelectedDevice(activeDevice.id);
        }
      }
    }
  }, [devicesQuery.data, selectedDeviceId, setDevices, setSelectedDevice]);

  // Type for playback control params
  type ControlParams = {
    action: 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'shuffle' | 'repeat' | 'volume' | 'transfer';
    deviceId?: string | undefined;
    contextUri?: string | undefined;
    uris?: string[] | undefined;
    offset?: { position: number } | { uri: string } | undefined;
    positionMs?: number | undefined;
    seekPositionMs?: number | undefined;
    shuffleState?: boolean | undefined;
    repeatState?: 'off' | 'track' | 'context' | undefined;
    volumePercent?: number | undefined;
  };

  // Playback control mutation
  const controlMutation = useMutation({
    mutationFn: async (params: ControlParams) => {
      return apiFetch<ControlResponse>('/api/player/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      // Refetch playback state after control action
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['spotify-playback-state'] });
      }, 300);
    },
    onError: (error: Error & { message?: string }) => {
      const message = error.message || 'Playback control failed';
      if (message.includes('no_active_device')) {
        toast.error('No active Spotify device. Open Spotify on a device or select one.');
        setDeviceSelectorOpen(true);
        // Refresh devices list
        queryClient.invalidateQueries({ queryKey: ['spotify-devices'] });
      } else if (message.includes('premium_required')) {
        toast.error('Spotify Premium is required for playback control.');
      } else {
        toast.error(message);
      }
      setError(message);
    },
  });

  // Play a specific track or resume playback
  const play = useCallback(async (options?: {
    trackUri?: string;
    trackUris?: string[];
    contextUri?: string;
    offset?: { position: number } | { uri: string };
    positionMs?: number;
    /** Track URIs for auto-play next feature */
    playlistTrackUris?: string[];
    /** Current position in the playlist */
    currentIndex?: number;
    /** Playlist ID for context */
    playlistId?: string;
  }) => {
    setLoading(true);
    setError(null);
    
    // Auto-show player when playing
    setPlayerVisible(true);

    try {
      // Get the device to use - prefer selected, fall back to web player
      const { webPlayerDeviceId, isWebPlayerReady, selectedDeviceId: currentSelectedDeviceId } = usePlayerStore.getState();
      let deviceId = currentSelectedDeviceId;
      
      // If no device selected but web player is ready, use it
      if (!deviceId && isWebPlayerReady && webPlayerDeviceId) {
        deviceId = webPlayerDeviceId;
        setSelectedDevice(webPlayerDeviceId);
      }
      
      // Build play request
      const params: ControlParams = {
        action: 'play',
        deviceId: deviceId || undefined,
      };

      if (options?.contextUri) {
        params.contextUri = options.contextUri;
        if (options.offset) params.offset = options.offset;
      } else if (options?.trackUri) {
        params.uris = [options.trackUri];
      } else if (options?.trackUris && options.trackUris.length > 0) {
        params.uris = options.trackUris;
        if (options.offset) params.offset = options.offset;
      }

      if (typeof options?.positionMs === 'number') {
        params.positionMs = options.positionMs;
      }

      await controlMutation.mutateAsync(params);

      // Update playback context for auto-play next
      if (options?.playlistTrackUris) {
        setPlaybackContext({
          ...(options.contextUri ? { contextUri: options.contextUri } : {}),
          trackUris: options.playlistTrackUris,
          currentIndex: options.currentIndex ?? 0,
          ...(options.playlistId ? { playlistId: options.playlistId } : {}),
        } as PlaybackContext);
      }
    } finally {
      setLoading(false);
    }
  }, [controlMutation, setLoading, setError, setPlaybackContext, setPlayerVisible, setSelectedDevice]);

  // Pause playback
  const pause = useCallback(async () => {
    setLoading(true);
    try {
      await controlMutation.mutateAsync({
        action: 'pause',
        deviceId: selectedDeviceId || undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, controlMutation, setLoading]);

  // Toggle play/pause
  const togglePlayPause = useCallback(async () => {
    if (playbackState?.isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [playbackState?.isPlaying, play, pause]);

  // Skip to next track
  // If playing from a context (playlist/album), Spotify handles this automatically
  // For Liked Songs or custom queue, we manually play the next track from our stored context
  const next = useCallback(async () => {
    setLoading(true);
    try {
      // Check if we have a Spotify context (playlist/album) that handles next automatically
      const hasSpotifyContext = playbackState?.context?.uri;
      
      if (hasSpotifyContext) {
        // Let Spotify handle next within the context
        await controlMutation.mutateAsync({
          action: 'next',
          deviceId: selectedDeviceId || undefined,
        });
        
        // Update our local index
        if (playbackContext && playbackContext.currentIndex < playbackContext.trackUris.length - 1) {
          setPlaybackContext({
            ...playbackContext,
            currentIndex: playbackContext.currentIndex + 1,
          });
        }
      } else if (playbackContext && playbackContext.currentIndex < playbackContext.trackUris.length - 1) {
        // No Spotify context (e.g., Liked Songs) - manually play next track
        const nextIndex = playbackContext.currentIndex + 1;
        const nextTrackUri = playbackContext.trackUris[nextIndex];
        
        if (nextTrackUri) {
          await controlMutation.mutateAsync({
            action: 'play',
            deviceId: selectedDeviceId || undefined,
            uris: [nextTrackUri],
          });
          
          setPlaybackContext({
            ...playbackContext,
            currentIndex: nextIndex,
          });
        }
      } else {
        // Fallback: just call Spotify's next
        await controlMutation.mutateAsync({
          action: 'next',
          deviceId: selectedDeviceId || undefined,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, controlMutation, playbackState?.context?.uri, playbackContext, setPlaybackContext, setLoading]);

  // Skip to previous track
  // If playing from a context (playlist/album), Spotify handles this automatically
  // For Liked Songs or custom queue, we manually play the previous track from our stored context
  const previous = useCallback(async () => {
    setLoading(true);
    try {
      // Check if we have a Spotify context (playlist/album) that handles previous automatically
      const hasSpotifyContext = playbackState?.context?.uri;
      
      if (hasSpotifyContext) {
        // Let Spotify handle previous within the context
        await controlMutation.mutateAsync({
          action: 'previous',
          deviceId: selectedDeviceId || undefined,
        });
        
        // Update our local index
        if (playbackContext && playbackContext.currentIndex > 0) {
          setPlaybackContext({
            ...playbackContext,
            currentIndex: playbackContext.currentIndex - 1,
          });
        }
      } else if (playbackContext && playbackContext.currentIndex > 0) {
        // No Spotify context (e.g., Liked Songs) - manually play previous track
        const prevIndex = playbackContext.currentIndex - 1;
        const prevTrackUri = playbackContext.trackUris[prevIndex];
        
        if (prevTrackUri) {
          await controlMutation.mutateAsync({
            action: 'play',
            deviceId: selectedDeviceId || undefined,
            uris: [prevTrackUri],
          });
          
          setPlaybackContext({
            ...playbackContext,
            currentIndex: prevIndex,
          });
        }
      } else {
        // Fallback: just call Spotify's previous (might restart current track)
        await controlMutation.mutateAsync({
          action: 'previous',
          deviceId: selectedDeviceId || undefined,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, controlMutation, playbackState?.context?.uri, playbackContext, setPlaybackContext, setLoading]);

  // Seek to position
  const seek = useCallback(async (positionMs: number) => {
    await controlMutation.mutateAsync({
      action: 'seek',
      deviceId: selectedDeviceId || undefined,
      seekPositionMs: positionMs,
    });
  }, [selectedDeviceId, controlMutation]);

  // Set volume
  const setVolume = useCallback(async (volumePercent: number) => {
    await controlMutation.mutateAsync({
      action: 'volume',
      deviceId: selectedDeviceId || undefined,
      volumePercent,
    });
  }, [selectedDeviceId, controlMutation]);

  // Toggle shuffle
  const toggleShuffle = useCallback(async () => {
    await controlMutation.mutateAsync({
      action: 'shuffle',
      deviceId: selectedDeviceId || undefined,
      shuffleState: !playbackState?.shuffleState,
    });
  }, [selectedDeviceId, playbackState?.shuffleState, controlMutation]);

  // Cycle repeat mode
  const cycleRepeat = useCallback(async () => {
    const states: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track'];
    const currentIdx = states.indexOf(playbackState?.repeatState ?? 'off');
    const nextState = states[(currentIdx + 1) % states.length];
    
    await controlMutation.mutateAsync({
      action: 'repeat',
      deviceId: selectedDeviceId || undefined,
      repeatState: nextState,
    });
  }, [selectedDeviceId, playbackState?.repeatState, controlMutation]);

  // Transfer playback to a device
  const transferPlayback = useCallback(async (deviceId: string) => {
    setLoading(true);
    try {
      await controlMutation.mutateAsync({
        action: 'transfer',
        deviceId,
      });
      setSelectedDevice(deviceId);
      setDeviceSelectorOpen(false);
      // Success - no toast needed
    } finally {
      setLoading(false);
    }
  }, [controlMutation, setSelectedDevice, setDeviceSelectorOpen, setLoading]);

  // Refresh devices list
  const refreshDevices = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['spotify-devices'] });
  }, [queryClient]);

  return {
    // State
    playbackState,
    devices,
    selectedDeviceId,
    isDeviceSelectorOpen,
    playbackContext,
    isLoading: isLoading || controlMutation.isPending,
    error,
    isPlaying: playbackState?.isPlaying ?? false,
    currentTrackId: currentTrackId(),
    
    // Web Playback SDK state
    webPlayerDeviceId,
    isWebPlayerReady,
    
    // Actions
    play,
    pause,
    togglePlayPause,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    transferPlayback,
    selectDevice: setSelectedDevice,
    openDeviceSelector: () => setDeviceSelectorOpen(true),
    closeDeviceSelector: () => setDeviceSelectorOpen(false),
    refreshDevices,
    
    // Player visibility
    isPlayerVisible,
    showPlayer: () => setPlayerVisible(true),
    hidePlayer: () => setPlayerVisible(false),
    togglePlayerVisible,
  };
}
