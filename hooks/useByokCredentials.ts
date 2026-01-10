'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'listmagify_byok_credentials';

export interface ByokCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Hook to manage BYOK (Bring Your Own Key) Spotify API credentials.
 * Credentials are stored in localStorage (browser-only, not synced).
 */
export function useByokCredentials() {
  const [credentials, setCredentialsState] = useState<ByokCredentials | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load credentials from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ByokCredentials;
        // Validate structure
        if (parsed.clientId && parsed.clientSecret) {
          setCredentialsState(parsed);
        }
      }
    } catch {
      // Invalid JSON, ignore
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoaded(true);
  }, []);

  const saveCredentials = useCallback((creds: ByokCredentials) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
      setCredentialsState(creds);
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearCredentials = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setCredentialsState(null);
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
