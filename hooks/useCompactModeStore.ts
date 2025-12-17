/**
 * Global state for compact mode toggle.
 * When enabled, reduces vertical and horizontal padding in track tables.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CompactModeStore {
  /** Whether compact mode is enabled */
  isCompact: boolean;
  /** Toggle compact mode */
  toggle: () => void;
  /** Set compact mode explicitly */
  setCompact: (isCompact: boolean) => void;
}

export const useCompactModeStore = create<CompactModeStore>()(
  persist(
    (set) => ({
      isCompact: false,
      toggle: () => set((state) => ({ isCompact: !state.isCompact })),
      setCompact: (isCompact) => set({ isCompact }),
    }),
    {
      name: 'compact-mode-storage',
    }
  )
);
