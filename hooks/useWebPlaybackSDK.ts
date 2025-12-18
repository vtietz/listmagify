/**
 * Hook for initializing and managing the Spotify Web Playback SDK.
 * Creates a playback device in the browser that can be used for playback.
 * 
 * @see https://developer.spotify.com/documentation/web-playback-sdk
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSessionUser } from './useSessionUser';
import { usePlayerStore } from './usePlayerStore';
import { apiFetch } from '@/lib/api/client';
import type { SpotifyDevice } from '@/lib/spotify/playerTypes';

// @ts-expect-error - sonner's type definitions are incompatible with verbatimModuleSyntax
import { toast } from 'sonner';

const PLAYER_NAME = 'Spotify Playlist Editor';
const SDK_SCRIPT_ID = 'spotify-web-playback-sdk';

interface TokenResponse {
  accessToken: string;
}

interface UseWebPlaybackSDKResult {
  /** The device ID of the web player, if ready */
  webPlayerDeviceId: string | null;
  /** Whether the web player is ready for playback */
  isReady: boolean;
  /** Whether the SDK is currently loading/initializing */
  isInitializing: boolean;
  /** Any error that occurred during initialization */
  error: string | null;
  /** Manually initialize the player (called automatically on mount) */
  initialize: () => void;
  /** Disconnect the player */
  disconnect: () => void;
}

/**
 * Custom hook for Spotify Web Playback SDK integration.
 * Initializes a playback device in the browser for direct audio playback.
 */
export function useWebPlaybackSDK(): UseWebPlaybackSDKResult {
  const { authenticated } = useSessionUser();
  const { 
    setSelectedDevice, 
    setDevices, 
    devices,
    setWebPlayerDeviceId,
    setWebPlayerReady,
    webPlayerDeviceId,
    isWebPlayerReady,
  } = usePlayerStore();
  
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const initializingRef = useRef(false);
  const mountedRef = useRef(true);
  
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load the SDK script
  const loadSDKScript = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      if (document.getElementById(SDK_SCRIPT_ID)) {
        // SDK already loaded
        if (window.Spotify) {
          resolve();
        } else {
          // Script is loading, wait for it
          const checkInterval = setInterval(() => {
            if (window.Spotify) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          
          // Timeout after 10 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('SDK script load timeout'));
          }, 10000);
        }
        return;
      }

      // Create script element
      const script = document.createElement('script');
      script.id = SDK_SCRIPT_ID;
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      
      // Set up the callback before the script loads
      window.onSpotifyWebPlaybackSDKReady = () => {
        resolve();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Spotify Web Playback SDK'));
      };
      
      document.body.appendChild(script);
    });
  }, []);

  // Get a fresh access token for the SDK
  const getAccessToken = useCallback(async (): Promise<string> => {
    const data = await apiFetch<TokenResponse>('/api/player/token');
    return data.accessToken;
  }, []);

  // Initialize the player
  const initialize = useCallback(async () => {
    if (!authenticated || initializingRef.current || playerRef.current) {
      return;
    }

    initializingRef.current = true;
    setIsInitializing(true);
    setError(null);

    try {
      // Load the SDK script
      await loadSDKScript();

      if (!mountedRef.current) return;

      // Create the player instance
      const player = new window.Spotify.Player({
        name: PLAYER_NAME,
        getOAuthToken: async (cb) => {
          try {
            const token = await getAccessToken();
            cb(token);
          } catch (err) {
            console.error('[WebPlaybackSDK] Failed to get token:', err);
          }
        },
        volume: 0.5,
      });

      // Handle ready event
      player.addListener('ready', ({ device_id }) => {
        console.log('[WebPlaybackSDK] Ready with device ID:', device_id);
        if (!mountedRef.current) return;
        
        deviceIdRef.current = device_id;
        setWebPlayerDeviceId(device_id);
        setWebPlayerReady(true);
        setIsInitializing(false);
        
        // Add the web player to the devices list
        const webPlayerDevice: SpotifyDevice = {
          id: device_id,
          name: PLAYER_NAME,
          type: 'Computer',
          isActive: false,
          isPrivateSession: false,
          isRestricted: false,
          volumePercent: 50,
          supportsVolume: true,
        };
        
        // Update devices list with web player at the front
        const currentDevices = usePlayerStore.getState().devices;
        setDevices([webPlayerDevice, ...currentDevices.filter(d => d.id !== device_id)]);
        
        // Auto-select if no device is selected
        const { selectedDeviceId } = usePlayerStore.getState();
        if (!selectedDeviceId) {
          setSelectedDevice(device_id);
        }
      });

      // Handle not ready event
      player.addListener('not_ready', ({ device_id }) => {
        console.log('[WebPlaybackSDK] Device offline:', device_id);
        if (!mountedRef.current) return;
        setWebPlayerReady(false);
      });

      // Handle errors
      player.addListener('initialization_error', ({ message }) => {
        console.error('[WebPlaybackSDK] Initialization error:', message);
        if (!mountedRef.current) return;
        setError(message);
        setIsInitializing(false);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error('[WebPlaybackSDK] Authentication error:', message);
        if (!mountedRef.current) return;
        setError(message);
        setIsInitializing(false);
      });

      player.addListener('account_error', ({ message }) => {
        console.error('[WebPlaybackSDK] Account error:', message);
        if (!mountedRef.current) return;
        setError(message);
        setIsInitializing(false);
        toast.error('Spotify Premium is required for web playback');
      });

      player.addListener('playback_error', ({ message }) => {
        console.error('[WebPlaybackSDK] Playback error:', message);
        toast.error(`Playback error: ${message}`);
      });

      // Activate element for mobile browsers
      await player.activateElement();
      
      // Connect the player
      const success = await player.connect();
      
      if (!success) {
        throw new Error('Failed to connect to Spotify');
      }

      playerRef.current = player;
      console.log('[WebPlaybackSDK] Player connected successfully');
    } catch (err: any) {
      console.error('[WebPlaybackSDK] Initialize error:', err);
      if (mountedRef.current) {
        setError(err.message || 'Failed to initialize web player');
        setIsInitializing(false);
      }
    } finally {
      initializingRef.current = false;
    }
  }, [authenticated, loadSDKScript, getAccessToken, setSelectedDevice, setDevices, setWebPlayerDeviceId, setWebPlayerReady]);

  // Disconnect the player
  const disconnect = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.disconnect();
      playerRef.current = null;
      deviceIdRef.current = null;
      setWebPlayerDeviceId(null);
      setWebPlayerReady(false);
      console.log('[WebPlaybackSDK] Disconnected');
    }
  }, [setWebPlayerDeviceId, setWebPlayerReady]);

  // Initialize on mount when authenticated
  useEffect(() => {
    if (authenticated) {
      initialize();
    }
    
    return () => {
      disconnect();
    };
  }, [authenticated, initialize, disconnect]);

  return {
    webPlayerDeviceId,
    isReady: isWebPlayerReady,
    isInitializing,
    error,
    initialize,
    disconnect,
  };
}
