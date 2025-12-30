/**
 * Global state for compact mode toggle.
 * When enabled, reduces vertical and horizontal padding in track tables.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useState, useEffect, useSyncExternalStore } from 'react';

interface CompactModeStore {
  /** Whether compact mode is enabled */
  isCompact: boolean;
  /** Whether the store has been hydrated from localStorage */
  _hasHydrated: boolean;
  /** Toggle compact mode */
  toggle: () => void;
  /** Set compact mode explicitly */
  setCompact: (isCompact: boolean) => void;
  /** Mark hydration as complete */
  setHasHydrated: (state: boolean) => void;
}

export const useCompactModeStore = create<CompactModeStore>()(
  persist(
    (set) => ({
      isCompact: false,
      _hasHydrated: false,
      toggle: () => set((state) => ({ isCompact: !state.isCompact })),
      setCompact: (isCompact) => set({ isCompact }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'compact-mode-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/**
 * Read compact mode directly from localStorage (synchronous).
 * This avoids the flash by reading the persisted value before React hydration.
 */
function getCompactModeFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem('compact-mode-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.isCompact ?? false;
    }
  } catch {
    // Ignore parse errors
  }
  return false;
}

// Cached value to avoid repeated localStorage reads
let cachedCompactMode: boolean | null = null;

function getSnapshot(): boolean {
  if (cachedCompactMode === null) {
    cachedCompactMode = getCompactModeFromStorage();
  }
  return cachedCompactMode;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  // Subscribe to store changes and update cache
  const unsubscribe = useCompactModeStore.subscribe((state) => {
    cachedCompactMode = state.isCompact;
    callback();
  });
  return unsubscribe;
}

/**
 * Hook that returns compact mode state without hydration flash.
 * Uses useSyncExternalStore to read from localStorage synchronously.
 */
export function useHydratedCompactMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
