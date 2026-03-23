/**
 * Hook for Spotify playback control.
 * Provides methods to play, pause, skip, and manage playback.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { usePlayerStore } from './usePlayerStore';
import { useSessionUser } from './useSessionUser';
import { useDeviceType } from './useDeviceType';
import { useMusicProviderId } from './useMusicProviderId';
import type { PlaybackDevice, PlaybackState } from '@/lib/music-provider/types';
import { toast } from '@/lib/ui/toast';
import { useMobileOverlayStore } from '@/components/split-editor/mobile/MobileBottomNav';
import {
  POLL_INTERVAL,
  type DevicesResponse,
  type PlaybackResponse,
  type ControlResponse,
  type ControlParams,
  type PlayOptions,
  resolvePlaybackDeviceId,
  buildPlayParams,
  maybeBuildPlaybackContext,
  getAutoAdvanceState,
  logAutoAdvanceCheck,
  maybeSyncContextIndex,
  detectTrackEnded,
  logTrackEnded,
} from './player/useSpotifyPlayerHelpers';

type UseSpotifyPlayerOptions = {
  enableStatePolling?: boolean;
};

export function useSpotifyPlayer(options?: UseSpotifyPlayerOptions) {
  const queryClient = useQueryClient();
  const providerId = useMusicProviderId();
  const isPlaybackSupported = providerId === 'spotify';
  const { authenticated } = useSessionUser();
  const enableStatePolling = options?.enableStatePolling ?? true;
  const shouldPollPlaybackState = authenticated && isPlaybackSupported && enableStatePolling;
  const { isPhone } = useDeviceType();
  const setMobileOverlay = useMobileOverlayStore((s) => s.setActiveOverlay);
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
    queryKey: ['playback-state', providerId],
    queryFn: async (): Promise<PlaybackState | null> => {
      const data = await apiFetch<PlaybackResponse>(`/api/player/state?provider=${providerId}`);
      return data.playback;
    },
    enabled: shouldPollPlaybackState,
    refetchInterval: shouldPollPlaybackState ? POLL_INTERVAL : false,
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
  const lastProgressRef = useRef<number>(0);
  const lastTrackEndDetectedRef = useRef<string | null>(null);

  // Auto-play next track when current track ends (for non-context playback like Liked Songs)
  // This effect monitors playback state and triggers next track when:
  // 1. We have a stored playlist context (trackUris)
  // 2. There's no Spotify context (so Spotify won't auto-advance)
  // 3. The track has ended (not playing, progress near end)
  useEffect(() => {
    if (!isPlaybackSupported) {
      return;
    }

    const autoAdvanceState = getAutoAdvanceState(
      playbackQuery.data,
      playbackContext,
      autoPlayInProgressRef.current
    );
    if (!autoAdvanceState) {
      return;
    }

    const { state, context } = autoAdvanceState;
    
    // Debug logging for auto-advance
    logAutoAdvanceCheck(state, context);

    maybeSyncContextIndex(state, context, setPlaybackContext, lastTrackUriRef);
    const { hasEnded, currentUri, threshold } = detectTrackEnded(
      state,
      lastProgressRef,
      lastTrackEndDetectedRef
    );

    logTrackEnded(hasEnded, threshold, currentUri, state, lastProgressRef);

    if (!hasEnded || !currentUri || context.currentIndex >= context.trackUris.length - 1) {
      return;
    }

      // Play next track
    const nextIndex = context.currentIndex + 1;
    const nextTrackUri = context.trackUris[nextIndex];
    if (!nextTrackUri) {
      return;
    }

    console.debug('[auto-advance] Triggering next track:', {
      nextIndex,
      nextTrackUri,
      sourceId: context.sourceId,
    });

    lastTrackEndDetectedRef.current = currentUri;
    autoPlayInProgressRef.current = true;

    apiFetch<ControlResponse>(`/api/player/control?provider=${providerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'play',
        deviceId: selectedDeviceId || undefined,
        uris: [nextTrackUri],
      }),
    })
      .then(() => {
        setPlaybackContext({
          ...context,
          currentIndex: nextIndex,
        });
        queryClient.invalidateQueries({ queryKey: ['playback-state', providerId] });
      })
      .catch((err) => {
        console.error('[auto-play next] Failed:', err);
      })
      .finally(() => {
        autoPlayInProgressRef.current = false;
      });
  }, [isPlaybackSupported, playbackQuery.data, playbackContext, selectedDeviceId, setPlaybackContext, queryClient, providerId]);

  // Fetch available devices - only when authenticated
  const devicesQuery = useQuery({
    queryKey: ['playback-devices', providerId],
    queryFn: async (): Promise<PlaybackDevice[]> => {
      const data = await apiFetch<DevicesResponse>(`/api/player/devices?provider=${providerId}`);
      return data.devices ?? [];
    },
    enabled: authenticated && isPlaybackSupported,
    staleTime: 10000,
    retry: false,
  });

  // Sync devices to store
  useEffect(() => {
    if (devicesQuery.data) {
      setDevices(devicesQuery.data);
      
      // Auto-select active device if none selected
      if (!selectedDeviceId) {
        const activeDevice = devicesQuery.data.find((d: PlaybackDevice) => d.isActive);
        if (activeDevice) {
          setSelectedDevice(activeDevice.id);
        }
      }
    }
  }, [devicesQuery.data, selectedDeviceId, setDevices, setSelectedDevice]);

  useEffect(() => {
    if (isPlaybackSupported) {
      return;
    }

    setPlaybackState(null);
    setDevices([]);
    setDeviceSelectorOpen(false);
  }, [isPlaybackSupported, setPlaybackState, setDevices, setDeviceSelectorOpen]);

  // Playback control mutation
  const controlMutation = useMutation({
    mutationFn: async (params: ControlParams) => {
      if (!isPlaybackSupported) {
        throw new Error('playback_unsupported_provider');
      }

      return apiFetch<ControlResponse>(`/api/player/control?provider=${providerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      // Refetch playback state after control action
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['playback-state', providerId] });
      }, 300);
    },
    onError: (error: Error & { message?: string }) => {
      const message = error.message || 'Playback control failed';
      if (message.includes('playback_unsupported_provider')) {
        toast.error('Playback controls are currently only supported for Spotify.');
      } else if (message.includes('no_active_device')) {
        toast.error('No active Spotify device. Open Spotify on a device or select one.');
        setDeviceSelectorOpen(true);
        // In mobile mode, also activate the player tab to show device selector
        if (isPhone) {
          setMobileOverlay('player');
        }
        // Refresh devices list
        queryClient.invalidateQueries({ queryKey: ['playback-devices', providerId] });
      } else if (message.includes('premium_required')) {
        toast.error('Spotify Premium is required to control playback. You can still use this app to organize playlists!');
      } else if (message.includes('token_expired') || message.includes('Authentication required')) {
        toast.error('Session expired. Please refresh the page.');
      } else {
        toast.error(message);
      }
      setError(message);
    },
  });

  // Play a specific track or resume playback
  const play = useCallback(async (options?: PlayOptions) => {
    setLoading(true);
    setError(null);
    
    // Auto-show player when playing
    setPlayerVisible(true);

    try {
      const deviceId = resolvePlaybackDeviceId(setSelectedDevice);
      const params = buildPlayParams(options, deviceId);

      await controlMutation.mutateAsync(params);

      // Update playback context for auto-play next
      const nextContext = maybeBuildPlaybackContext(options);
      if (nextContext) {
        setPlaybackContext(nextContext);
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
    if (!isPlaybackSupported) {
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['playback-devices', providerId] });
  }, [isPlaybackSupported, queryClient, providerId]);

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

export const useProviderPlayer = useSpotifyPlayer;
