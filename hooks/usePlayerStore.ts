/**
 * Zustand store for Spotify playback state and controls.
 * Manages player UI state, device selection, and playback queue context.
 */

import { create } from 'zustand';
import type { SpotifyDevice, PlaybackState } from '@/lib/spotify/playerTypes';

export interface PlaybackContext {
  /** Playlist, album, or artist URI */
  contextUri?: string;
  /** List of track URIs for the current playlist/context */
  trackUris: string[];
  /** Current track index in the list */
  currentIndex: number;
  /** Playlist ID if playing from a playlist */
  playlistId?: string;
}

interface PlayerStore {
  // Playback state
  playbackState: PlaybackState | null;
  isLoading: boolean;
  error: string | null;
  
  // Device management
  devices: SpotifyDevice[];
  selectedDeviceId: string | null;
  isDeviceSelectorOpen: boolean;
  
  // Web Playback SDK state
  webPlayerDeviceId: string | null;
  isWebPlayerReady: boolean;
  
  // Current playback context (for auto-play next)
  playbackContext: PlaybackContext | null;
  
  // UI state
  isPlayerVisible: boolean;
  
  // Actions
  setPlaybackState: (state: PlaybackState | null) => void;
  setDevices: (devices: SpotifyDevice[]) => void;
  setSelectedDevice: (deviceId: string | null) => void;
  setDeviceSelectorOpen: (open: boolean) => void;
  setWebPlayerDeviceId: (deviceId: string | null) => void;
  setWebPlayerReady: (ready: boolean) => void;
  setPlaybackContext: (context: PlaybackContext | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPlayerVisible: (visible: boolean) => void;
  togglePlayerVisible: () => void;
  
  // Computed: currently playing track ID
  currentTrackId: () => string | null;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  // Initial state
  playbackState: null,
  isLoading: false,
  error: null,
  devices: [],
  selectedDeviceId: null,
  isDeviceSelectorOpen: false,
  webPlayerDeviceId: null,
  isWebPlayerReady: false,
  playbackContext: null,
  isPlayerVisible: false, // Hidden by default

  // Actions
  setPlaybackState: (playbackState) => set({ playbackState }),
  setDevices: (devices) => set({ devices }),
  setSelectedDevice: (selectedDeviceId) => set({ selectedDeviceId }),
  setDeviceSelectorOpen: (isDeviceSelectorOpen) => set({ isDeviceSelectorOpen }),
  setWebPlayerDeviceId: (webPlayerDeviceId) => set({ webPlayerDeviceId }),
  setWebPlayerReady: (isWebPlayerReady) => set({ isWebPlayerReady }),
  setPlaybackContext: (playbackContext) => set({ playbackContext }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setPlayerVisible: (isPlayerVisible) => set({ isPlayerVisible }),
  togglePlayerVisible: () => set((state) => ({ isPlayerVisible: !state.isPlayerVisible })),

  // Computed
  currentTrackId: () => {
    const { playbackState } = get();
    return playbackState?.track?.id ?? null;
  },
}));
