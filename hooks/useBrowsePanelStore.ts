/**
 * Zustand store for managing the Browse (Spotify Search) panel state.
 * Handles open/close state and search query persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BrowsePanelState {
  /** Whether the browse panel is open */
  isOpen: boolean;
  /** Current search query */
  searchQuery: string;
  /** Panel width in pixels */
  width: number;
  /** Whether the recommendations panel is expanded */
  recsExpanded: boolean;
  /** Height of the recommendations panel in pixels (when expanded) */
  recsHeight: number;
  
  // Actions
  toggle: () => void;
  open: () => void;
  close: () => void;
  setSearchQuery: (query: string) => void;
  setWidth: (width: number) => void;
  setRecsExpanded: (expanded: boolean) => void;
  toggleRecsExpanded: () => void;
  setRecsHeight: (height: number) => void;
}

export const useBrowsePanelStore = create<BrowsePanelState>()(
  persist(
    (set) => ({
      isOpen: false,
      searchQuery: '',
      width: 400,
      recsExpanded: false,
      recsHeight: 300,
      
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setWidth: (width) => set({ width: Math.max(300, Math.min(800, width)) }),
      setRecsExpanded: (expanded) => set({ recsExpanded: expanded }),
      toggleRecsExpanded: () => set((state) => ({ recsExpanded: !state.recsExpanded })),
      setRecsHeight: (height) => set({ recsHeight: Math.max(150, Math.min(500, height)) }),
    }),
    {
      name: 'browse-panel-storage',
      partialize: (state) => ({
        isOpen: state.isOpen,
        width: state.width,
        recsExpanded: state.recsExpanded,
        recsHeight: state.recsHeight,
        // Don't persist searchQuery - start fresh each session
      }),
    }
  )
);
