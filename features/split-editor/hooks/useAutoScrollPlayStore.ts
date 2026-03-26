/**
 * Store for auto-scroll during playback preference.
 * When enabled, panels will auto-scroll to keep the playing track visible.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSyncExternalStore } from 'react';

interface AutoScrollPlayState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

export const useAutoScrollPlayStore = create<AutoScrollPlayState>()(
  persist(
    (set) => ({
      enabled: false, // Disabled by default
      setEnabled: (enabled) => set({ enabled }),
      toggle: () => set((state) => ({ enabled: !state.enabled })),
    }),
    {
      name: 'auto-scroll-play',
    }
  )
);

/**
 * Hook to get the hydrated auto-scroll value (avoids SSR mismatch).
 * Returns false during SSR, then the persisted value after hydration.
 */
export function useHydratedAutoScrollPlay(): boolean {
  return useSyncExternalStore(
    useAutoScrollPlayStore.persist.onFinishHydration,
    () => useAutoScrollPlayStore.getState().enabled,
    () => false // SSR fallback
  );
}
