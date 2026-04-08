'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MusicProviderId } from '@/lib/music-provider/types';

function getStorageKey(providerId: string): string {
  return `listmagify_byok_credentials_${providerId}`;
}

function getStorageEvent(providerId: string): string {
  return `byok_credentials_changed_${providerId}`;
}

const LEGACY_STORAGE_KEY = 'listmagify_byok_credentials';

export interface ByokCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Hook to manage BYOK (Bring Your Own Key) API credentials per provider.
 * Credentials are stored in localStorage (browser-only, not synced).
 * Updates reactively across all components when credentials change.
 */
export function useByokCredentials(providerId: MusicProviderId = 'spotify') {
  const [credentials, setCredentialsState] = useState<ByokCredentials | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const storageKey = getStorageKey(providerId);
  const storageEvent = getStorageEvent(providerId);

  // Migrate legacy unscoped key to provider-specific key (Spotify only)
  useEffect(() => {
    if (providerId !== 'spotify') return;
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && !localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {
      // Ignore migration errors
    }
  }, [providerId, storageKey]);

  // Helper to load credentials from localStorage
  const loadCredentials = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ByokCredentials;
        // Validate structure
        if (parsed.clientId && parsed.clientSecret) {
          setCredentialsState(parsed);
          return;
        }
      }
      setCredentialsState(null);
    } catch {
      // Invalid JSON, ignore
      localStorage.removeItem(storageKey);
      setCredentialsState(null);
    }
  }, [storageKey]);

  // Load credentials on mount
  useEffect(() => {
    loadCredentials();
    setIsLoaded(true);
  }, [loadCredentials]);

  // Listen for credential changes from other components
  useEffect(() => {
    const handleCredentialsChanged = () => {
      loadCredentials();
    };

    window.addEventListener(storageEvent, handleCredentialsChanged);
    return () => {
      window.removeEventListener(storageEvent, handleCredentialsChanged);
    };
  }, [loadCredentials, storageEvent]);

  const saveCredentials = useCallback((creds: ByokCredentials) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(creds));
      setCredentialsState(creds);
      // Notify other components
      window.dispatchEvent(new Event(storageEvent));
      return true;
    } catch {
      return false;
    }
  }, [storageKey, storageEvent]);

  const clearCredentials = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setCredentialsState(null);
      // Notify other components
      window.dispatchEvent(new Event(storageEvent));
      return true;
    } catch {
      return false;
    }
  }, [storageKey, storageEvent]);

  const hasCredentials = credentials !== null &&
    credentials.clientId.length > 0 &&
    credentials.clientSecret.length > 0;

  return {
    credentials,
    hasCredentials,
    isLoaded,
    saveCredentials,
    clearCredentials,
  };
}
