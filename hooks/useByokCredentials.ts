'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'listmagify_byok_credentials';
const STORAGE_EVENT = 'byok_credentials_changed';

export interface ByokCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Hook to manage BYOK (Bring Your Own Key) Spotify API credentials.
 * Credentials are stored in localStorage (browser-only, not synced).
 * Updates reactively across all components when credentials change.
 */
export function useByokCredentials() {
  const [credentials, setCredentialsState] = useState<ByokCredentials | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Helper to load credentials from localStorage
  const loadCredentials = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
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
      localStorage.removeItem(STORAGE_KEY);
      setCredentialsState(null);
    }
  }, []);

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

    window.addEventListener(STORAGE_EVENT, handleCredentialsChanged);
    return () => {
      window.removeEventListener(STORAGE_EVENT, handleCredentialsChanged);
    };
  }, [loadCredentials]);

  const saveCredentials = useCallback((creds: ByokCredentials) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
      setCredentialsState(creds);
      // Notify other components
      window.dispatchEvent(new Event(STORAGE_EVENT));
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearCredentials = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setCredentialsState(null);
      // Notify other components
      window.dispatchEvent(new Event(STORAGE_EVENT));
      return true;
    } catch {
      return false;
    }
  }, []);

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
