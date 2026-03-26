import type { MutableRefObject } from 'react';
import type { PlaybackDevice, PlaybackState } from '@/lib/music-provider/types';
import { usePlayerStore, type PlaybackContext } from './usePlayerStore';

export const POLL_INTERVAL = 5000; // Poll playback state every 5 seconds

export interface DevicesResponse {
  devices: PlaybackDevice[];
}

export interface PlaybackResponse {
  playback: PlaybackState | null;
}

export interface ControlResponse {
  success?: boolean;
  error?: string;
  message?: string;
}

export type ControlParams = {
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

export type PlayOptions = {
  trackUri?: string;
  trackUris?: string[];
  contextUri?: string;
  offset?: { position: number } | { uri: string };
  positionMs?: number;
  playlistTrackUris?: string[];
  currentIndex?: number;
  playlistId?: string;
  sourceId?: string;
};

export function resolvePlaybackDeviceId(setSelectedDevice: (deviceId: string) => void): string | undefined {
  const { webPlayerDeviceId, isWebPlayerReady, selectedDeviceId } = usePlayerStore.getState();
  if (selectedDeviceId) {
    return selectedDeviceId;
  }

  if (!isWebPlayerReady || !webPlayerDeviceId) {
    return undefined;
  }

  setSelectedDevice(webPlayerDeviceId);
  return webPlayerDeviceId;
}

function resolvePlayPayload(options: PlayOptions | undefined): Partial<ControlParams> {
  if (!options) {
    return {};
  }

  if (options.contextUri) {
    return {
      contextUri: options.contextUri,
      ...(options.offset ? { offset: options.offset } : {}),
    };
  }

  if (options.trackUri) {
    return { uris: [options.trackUri] };
  }

  if (options.trackUris && options.trackUris.length > 0) {
    return {
      uris: options.trackUris,
      ...(options.offset ? { offset: options.offset } : {}),
    };
  }

  return {};
}

export function buildPlayParams(options: PlayOptions | undefined, deviceId: string | undefined): ControlParams {
  const payload = resolvePlayPayload(options);
  const params: ControlParams = {
    action: 'play',
    deviceId: deviceId || undefined,
    ...payload,
  };

  if (typeof options?.positionMs === 'number') {
    params.positionMs = options.positionMs;
  }

  return params;
}

export function maybeBuildPlaybackContext(options: PlayOptions | undefined): PlaybackContext | null {
  if (!options?.playlistTrackUris) {
    return null;
  }

  return {
    ...(options.contextUri ? { contextUri: options.contextUri } : {}),
    trackUris: options.playlistTrackUris,
    currentIndex: options.currentIndex ?? 0,
    ...(options.playlistId ? { playlistId: options.playlistId } : {}),
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
  } as PlaybackContext;
}

export function getAutoAdvanceState(
  state: PlaybackState | null,
  context: PlaybackContext | null,
  inProgress: boolean
): { state: PlaybackState; context: PlaybackContext } | null {
  if (!state || !context || inProgress) {
    return null;
  }

  if (state.context?.uri || !state.track) {
    return null;
  }

  return { state, context };
}

export function logAutoAdvanceCheck(state: PlaybackState, context: PlaybackContext) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.debug('[auto-advance] Check:', {
    trackUri: state.track?.uri,
    isPlaying: state.isPlaying,
    progress: state.progressMs,
    duration: state.track?.durationMs,
    currentIndex: context.currentIndex,
    totalTracks: context.trackUris.length,
    sourceId: context.sourceId,
  });
}

export function logTrackEnded(
  hasEnded: boolean,
  threshold: number,
  currentUri: string | null,
  state: PlaybackState,
  lastProgressRef: MutableRefObject<number>
) {
  if (process.env.NODE_ENV !== 'development' || !hasEnded) {
    return;
  }

  console.debug('[auto-advance] Track ended detected:', {
    lastProgress: lastProgressRef.current,
    currentProgress: state.progressMs,
    threshold,
    currentUri,
  });
}

export function maybeSyncContextIndex(
  state: PlaybackState,
  playbackContext: PlaybackContext,
  setPlaybackContext: (context: PlaybackContext | null) => void,
  lastTrackUriRef: MutableRefObject<string | null>
) {
  const currentUri = state.track?.uri;
  if (!currentUri) {
    return;
  }

  if (lastTrackUriRef.current && lastTrackUriRef.current !== currentUri) {
    const newIndex = playbackContext.trackUris.indexOf(currentUri);
    if (newIndex >= 0 && newIndex !== playbackContext.currentIndex) {
      setPlaybackContext({
        ...playbackContext,
        currentIndex: newIndex,
      });
    }
  }

  lastTrackUriRef.current = currentUri;
}

export function detectTrackEnded(
  state: PlaybackState,
  lastProgressRef: MutableRefObject<number>,
  lastTrackEndDetectedRef: MutableRefObject<string | null>
): { hasEnded: boolean; currentUri: string | null; threshold: number } {
  const track = state.track;
  if (!track?.uri) {
    return { hasEnded: false, currentUri: null, threshold: 0 };
  }

  const currentUri = track.uri;
  const lastProgress = lastProgressRef.current;
  const threshold = track.durationMs * 0.8;
  const hasProgressReset = lastProgress > threshold && state.progressMs < 2000;
  const isStoppedAtStart = !state.isPlaying && state.progressMs < 2000;
  const alreadyHandled = lastTrackEndDetectedRef.current === currentUri;

  lastProgressRef.current = state.progressMs;

  return {
    hasEnded: hasProgressReset || (isStoppedAtStart && lastProgress > threshold && !alreadyHandled),
    currentUri,
    threshold,
  };
}