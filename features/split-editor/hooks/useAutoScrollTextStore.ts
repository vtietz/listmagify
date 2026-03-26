/**
 * Global state for auto-scroll text mode toggle.
 * When enabled, text that overflows its container will smoothly scroll horizontally.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSyncExternalStore } from 'react';

interface AutoScrollTextStore {
  /** Whether auto-scroll text mode is enabled */
  isEnabled: boolean;
  /** Whether the store has been hydrated from localStorage */
  _hasHydrated: boolean;
  /** Toggle auto-scroll text mode */
  toggle: () => void;
  /** Set auto-scroll text mode explicitly */
  setEnabled: (isEnabled: boolean) => void;
  /** Mark hydration as complete */
  setHasHydrated: (state: boolean) => void;
}

export const useAutoScrollTextStore = create<AutoScrollTextStore>()(
  persist(
    (set) => ({
      isEnabled: false,
      _hasHydrated: false,
      toggle: () => set((state) => ({ isEnabled: !state.isEnabled })),
      setEnabled: (isEnabled) => set({ isEnabled }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'auto-scroll-text-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * Read auto-scroll text mode directly from localStorage (synchronous).
 * This avoids the flash by reading the persisted value before React hydration.
 */
function getAutoScrollTextFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem('auto-scroll-text-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.isEnabled ?? false;
    }
  } catch {
    // Ignore parse errors
  }
  return false;
}

// Cached value to avoid repeated localStorage reads
let cachedAutoScrollText: boolean | null = null;

function getSnapshot(): boolean {
  if (cachedAutoScrollText === null) {
    cachedAutoScrollText = getAutoScrollTextFromStorage();
  }
  return cachedAutoScrollText;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  // Subscribe to store changes and update cache
  const unsubscribe = useAutoScrollTextStore.subscribe((state) => {
    cachedAutoScrollText = state.isEnabled;
    callback();
  });
  return unsubscribe;
}

/**
 * Hook that returns auto-scroll text state without hydration flash.
 * Uses useSyncExternalStore to read from localStorage synchronously.
 */
export function useHydratedAutoScrollText(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
