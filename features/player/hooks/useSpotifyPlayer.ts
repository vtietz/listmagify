/**
 * Hook for Spotify playback control.
 * Provides methods to play, pause, skip, and manage playback.
 */

/* eslint-disable max-lines */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { usePlayerStore } from './usePlayerStore';
import type { PlaybackContext } from './usePlayerStore';
import { useSessionUser } from '@features/auth/hooks/useSessionUser';
import { useDeviceType } from '@shared/hooks/useDeviceType';
import { useMusicProviderId } from '@features/auth/hooks/useMusicProviderId';
import { supportsProviderPlaybackControl } from '@/lib/music-provider/capabilities';
import type { PlaybackDevice, PlaybackState } from '@/lib/music-provider/types';
import { toast } from '@/lib/ui/toast';
import { useMobileOverlayStore } from '@/components/split-editor/mobile/MobileBottomNav';
import type { MobileOverlay } from '@/components/split-editor/mobile/MobileBottomNav';
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
} from './useSpotifyPlayerHelpers';

type UseSpotifyPlayerOptions = {
  enableStatePolling?: boolean;
};

type UseSpotifyPlayerAutoAdvanceOptions = {
  isPlaybackSupported: boolean;
  playbackData: PlaybackState | null;
  playbackContext: PlaybackContext | null;
  selectedDeviceId: string | null;
  providerId: 'spotify' | 'tidal';
  setPlaybackContext: (context: PlaybackContext | null) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  autoPlayInProgressRef: React.MutableRefObject<boolean>;
  lastTrackUriRef: React.MutableRefObject<string | null>;
  lastProgressRef: React.MutableRefObject<number>;
  lastTrackEndDetectedRef: React.MutableRefObject<string | null>;
};

function useAutoAdvancePlayback({
  isPlaybackSupported,
  playbackData,
  playbackContext,
  selectedDeviceId,
  providerId,
  setPlaybackContext,
  queryClient,
  autoPlayInProgressRef,
  lastTrackUriRef,
  lastProgressRef,
  lastTrackEndDetectedRef,
}: UseSpotifyPlayerAutoAdvanceOptions) {
  useEffect(() => {
    if (!isPlaybackSupported) {
      return;
    }

    const autoAdvanceState = getAutoAdvanceState(
      playbackData,
      playbackContext,
      autoPlayInProgressRef.current
    );
    if (!autoAdvanceState) {
      return;
    }

    const { state, context } = autoAdvanceState;
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
  }, [
    isPlaybackSupported,
    playbackData,
    playbackContext,
    selectedDeviceId,
    setPlaybackContext,
    queryClient,
    providerId,
    autoPlayInProgressRef,
    lastTrackUriRef,
    lastProgressRef,
    lastTrackEndDetectedRef,
  ]);
}

function handlePlaybackControlError(options: {
  error: Error & { message?: string };
  isPhone: boolean;
  setDeviceSelectorOpen: (open: boolean) => void;
  setMobileOverlay: (overlay: MobileOverlay) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  providerId: 'spotify' | 'tidal';
  setError: (error: string | null) => void;
}): void {
  const message = options.error.message || 'Playback control failed';
  if (message.includes('playback_unsupported_provider')) {
    toast.error('Playback controls are currently only supported for Spotify.');
  } else if (message.includes('no_active_device')) {
    toast.error('No active Spotify device. Open Spotify on a device or select one.');
    options.setDeviceSelectorOpen(true);
    if (options.isPhone) {
      options.setMobileOverlay('player');
    }
    options.queryClient.invalidateQueries({ queryKey: ['playback-devices', options.providerId] });
  } else if (message.includes('premium_required')) {
    toast.error('Spotify Premium is required to control playback. You can still use this app to organize playlists!');
  } else if (message.includes('token_expired') || message.includes('Authentication required')) {
    toast.error('Session expired. Please refresh the page.');
  } else {
    toast.error(message);
  }

  options.setError(message);
}

function assertPlaybackSupported(isPlaybackSupported: boolean): void {
  if (!isPlaybackSupported) {
    throw new Error('playback_unsupported_provider');
  }
}

function useSyncPlaybackState(
  playbackData: PlaybackState | null | undefined,
  setPlaybackState: (state: PlaybackState | null) => void,
) {
  useEffect(() => {
    if (playbackData !== undefined) {
      setPlaybackState(playbackData);
    }
  }, [playbackData, setPlaybackState]);
}

function useSyncDevices(
  deviceData: PlaybackDevice[] | undefined,
  selectedDeviceId: string | null,
  setDevices: (devices: PlaybackDevice[]) => void,
  setSelectedDevice: (deviceId: string | null) => void,
) {
  useEffect(() => {
    if (!deviceData) {
      return;
    }

    setDevices(deviceData);
    if (selectedDeviceId) {
      return;
    }

    const activeDevice = deviceData.find((d: PlaybackDevice) => d.isActive);
    if (activeDevice) {
      setSelectedDevice(activeDevice.id);
    }
  }, [deviceData, selectedDeviceId, setDevices, setSelectedDevice]);
}

function useResetUnsupportedProviderState(
  isPlaybackSupported: boolean,
  setPlaybackState: (state: PlaybackState | null) => void,
  setDevices: (devices: PlaybackDevice[]) => void,
  setDeviceSelectorOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (isPlaybackSupported) {
      return;
    }

    setPlaybackState(null);
    setDevices([]);
    setDeviceSelectorOpen(false);
  }, [isPlaybackSupported, setPlaybackState, setDevices, setDeviceSelectorOpen]);
}

function maybeSetPlaybackContextFromPlay(
  options: PlayOptions | undefined,
  setPlaybackContext: (context: PlaybackContext | null) => void,
): void {
  const nextContext = maybeBuildPlaybackContext(options);
  if (nextContext) {
    setPlaybackContext(nextContext);
  }
}

function createTogglePlayPauseAction(params: {
  isPlaying: boolean;
  play: () => Promise<void>;
  pause: () => Promise<void>;
}): () => Promise<void> {
  return async () => {
    if (params.isPlaying) {
      await params.pause();
      return;
    }

    await params.play();
  };
}

function refreshDevicesForProvider(
  isPlaybackSupported: boolean,
  queryClient: ReturnType<typeof useQueryClient>,
  providerId: 'spotify' | 'tidal',
): void {
  if (!isPlaybackSupported) {
    return;
  }

  queryClient.invalidateQueries({ queryKey: ['playback-devices', providerId] });
}

type ControlMutateAsync = (params: ControlParams) => Promise<ControlResponse>;
type ControlMutationState = {
  mutateAsync: ControlMutateAsync;
  isPending: boolean;
};

function usePlaybackTransportActions(params: {
  controlMutation: ControlMutationState;
  selectedDeviceId: string | null;
  playbackState: PlaybackState | null;
  playbackContext: PlaybackContext | null;
  setPlaybackContext: (context: PlaybackContext | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPlayerVisible: (visible: boolean) => void;
  setSelectedDevice: (deviceId: string | null) => void;
}) {
  const play = useCallback(async (options?: PlayOptions) => {
    params.setLoading(true);
    params.setError(null);
    params.setPlayerVisible(true);

    try {
      const deviceId = resolvePlaybackDeviceId(params.setSelectedDevice);
      const playParams = buildPlayParams(options, deviceId);
      await params.controlMutation.mutateAsync(playParams);
      maybeSetPlaybackContextFromPlay(options, params.setPlaybackContext);
    } finally {
      params.setLoading(false);
    }
  }, [params]);

  const pause = useCallback(async () => {
    params.setLoading(true);
    try {
      await params.controlMutation.mutateAsync({
        action: 'pause',
        deviceId: params.selectedDeviceId || undefined,
      });
    } finally {
      params.setLoading(false);
    }
  }, [params]);

  const togglePlayPause = useCallback(async () => {
    await createTogglePlayPauseAction({ isPlaying: Boolean(params.playbackState?.isPlaying), play, pause })();
  }, [params.playbackState?.isPlaying, play, pause]);

  const next = useCallback(async () => {
    params.setLoading(true);
    try {
      await executeNextPlaybackAction({
        hasSpotifyContext: Boolean(params.playbackState?.context?.uri),
        selectedDeviceId: params.selectedDeviceId,
        playbackContext: params.playbackContext,
        mutateAsync: params.controlMutation.mutateAsync,
        setPlaybackContext: params.setPlaybackContext,
      });
    } finally {
      params.setLoading(false);
    }
  }, [params]);

  const previous = useCallback(async () => {
    params.setLoading(true);
    try {
      await executePreviousPlaybackAction({
        hasSpotifyContext: Boolean(params.playbackState?.context?.uri),
        selectedDeviceId: params.selectedDeviceId,
        playbackContext: params.playbackContext,
        mutateAsync: params.controlMutation.mutateAsync,
        setPlaybackContext: params.setPlaybackContext,
      });
    } finally {
      params.setLoading(false);
    }
  }, [params]);

  return { play, pause, togglePlayPause, next, previous };
}

function usePlaybackSettingsActions(params: {
  controlMutation: ControlMutationState;
  selectedDeviceId: string | null;
  playbackState: PlaybackState | null;
}) {
  const seek = useCallback(async (positionMs: number) => {
    await params.controlMutation.mutateAsync({
      action: 'seek',
      deviceId: params.selectedDeviceId || undefined,
      seekPositionMs: positionMs,
    });
  }, [params]);

  const setVolume = useCallback(async (volumePercent: number) => {
    await params.controlMutation.mutateAsync({
      action: 'volume',
      deviceId: params.selectedDeviceId || undefined,
      volumePercent,
    });
  }, [params]);

  const toggleShuffle = useCallback(async () => {
    await params.controlMutation.mutateAsync({
      action: 'shuffle',
      deviceId: params.selectedDeviceId || undefined,
      shuffleState: !params.playbackState?.shuffleState,
    });
  }, [params]);

  const cycleRepeat = useCallback(async () => {
    const states: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track'];
    const currentIdx = states.indexOf(params.playbackState?.repeatState ?? 'off');
    const nextState = states[(currentIdx + 1) % states.length];

    await params.controlMutation.mutateAsync({
      action: 'repeat',
      deviceId: params.selectedDeviceId || undefined,
      repeatState: nextState,
    });
  }, [params]);

  return { seek, setVolume, toggleShuffle, cycleRepeat };
}

function usePlaybackDeviceActions(params: {
  controlMutation: ControlMutationState;
  setSelectedDevice: (deviceId: string | null) => void;
  setDeviceSelectorOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  isPlaybackSupported: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
  providerId: 'spotify' | 'tidal';
}) {
  const transferPlayback = useCallback(async (deviceId: string) => {
    params.setLoading(true);
    try {
      await params.controlMutation.mutateAsync({
        action: 'transfer',
        deviceId,
      });
      params.setSelectedDevice(deviceId);
      params.setDeviceSelectorOpen(false);
    } finally {
      params.setLoading(false);
    }
  }, [params]);

  const refreshDevices = useCallback(() => {
    refreshDevicesForProvider(params.isPlaybackSupported, params.queryClient, params.providerId);
  }, [params]);

  return { transferPlayback, refreshDevices };
}

async function executeNextPlaybackAction(params: {
  hasSpotifyContext: boolean;
  selectedDeviceId: string | null;
  playbackContext: PlaybackContext | null;
  mutateAsync: ControlMutateAsync;
  setPlaybackContext: (context: PlaybackContext | null) => void;
}): Promise<void> {
  const deviceId = params.selectedDeviceId || undefined;

  if (params.hasSpotifyContext) {
    await params.mutateAsync({ action: 'next', deviceId });

    if (params.playbackContext && params.playbackContext.currentIndex < params.playbackContext.trackUris.length - 1) {
      params.setPlaybackContext({
        ...params.playbackContext,
        currentIndex: params.playbackContext.currentIndex + 1,
      });
    }
    return;
  }

  if (params.playbackContext && params.playbackContext.currentIndex < params.playbackContext.trackUris.length - 1) {
    const nextIndex = params.playbackContext.currentIndex + 1;
    const nextTrackUri = params.playbackContext.trackUris[nextIndex];

    if (nextTrackUri) {
      await params.mutateAsync({ action: 'play', deviceId, uris: [nextTrackUri] });
      params.setPlaybackContext({
        ...params.playbackContext,
        currentIndex: nextIndex,
      });
      return;
    }
  }

  await params.mutateAsync({ action: 'next', deviceId });
}

async function executePreviousPlaybackAction(params: {
  hasSpotifyContext: boolean;
  selectedDeviceId: string | null;
  playbackContext: PlaybackContext | null;
  mutateAsync: ControlMutateAsync;
  setPlaybackContext: (context: PlaybackContext | null) => void;
}): Promise<void> {
  const deviceId = params.selectedDeviceId || undefined;

  if (params.hasSpotifyContext) {
    await params.mutateAsync({ action: 'previous', deviceId });

    if (params.playbackContext && params.playbackContext.currentIndex > 0) {
      params.setPlaybackContext({
        ...params.playbackContext,
        currentIndex: params.playbackContext.currentIndex - 1,
      });
    }
    return;
  }

  if (params.playbackContext && params.playbackContext.currentIndex > 0) {
    const prevIndex = params.playbackContext.currentIndex - 1;
    const prevTrackUri = params.playbackContext.trackUris[prevIndex];

    if (prevTrackUri) {
      await params.mutateAsync({ action: 'play', deviceId, uris: [prevTrackUri] });
      params.setPlaybackContext({
        ...params.playbackContext,
        currentIndex: prevIndex,
      });
      return;
    }
  }

  await params.mutateAsync({ action: 'previous', deviceId });
}

export function useSpotifyPlayer(options?: UseSpotifyPlayerOptions) {
  const queryClient = useQueryClient();
  const providerId = useMusicProviderId();
  const isPlaybackSupported = supportsProviderPlaybackControl(providerId);
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

  useSyncPlaybackState(playbackQuery.data, setPlaybackState);

  // Track the last played track URI to detect track changes
  const lastTrackUriRef = useRef<string | null>(null);
  const autoPlayInProgressRef = useRef(false);
  const lastProgressRef = useRef<number>(0);
  const lastTrackEndDetectedRef = useRef<string | null>(null);

  useAutoAdvancePlayback({
    isPlaybackSupported,
    playbackData: playbackQuery.data ?? null,
    playbackContext,
    selectedDeviceId,
    providerId,
    setPlaybackContext,
    queryClient,
    autoPlayInProgressRef,
    lastTrackUriRef,
    lastProgressRef,
    lastTrackEndDetectedRef,
  });

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

  useSyncDevices(devicesQuery.data, selectedDeviceId, setDevices, setSelectedDevice);
  useResetUnsupportedProviderState(isPlaybackSupported, setPlaybackState, setDevices, setDeviceSelectorOpen);

  // Playback control mutation
  const controlMutation = useMutation({
    mutationFn: async (params: ControlParams) => {
      assertPlaybackSupported(isPlaybackSupported);

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
      handlePlaybackControlError({
        error,
        isPhone,
        setDeviceSelectorOpen,
        setMobileOverlay,
        queryClient,
        providerId,
        setError,
      });
    },
  });

  const { play, pause, togglePlayPause, next, previous } = usePlaybackTransportActions({
    controlMutation,
    selectedDeviceId,
    playbackState,
    playbackContext,
    setPlaybackContext,
    setLoading,
    setError,
    setPlayerVisible,
    setSelectedDevice,
  });

  const { seek, setVolume, toggleShuffle, cycleRepeat } = usePlaybackSettingsActions({
    controlMutation,
    selectedDeviceId,
    playbackState,
  });

  const { transferPlayback, refreshDevices } = usePlaybackDeviceActions({
    controlMutation,
    setSelectedDevice,
    setDeviceSelectorOpen,
    setLoading,
    isPlaybackSupported,
    queryClient,
    providerId,
  });

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
