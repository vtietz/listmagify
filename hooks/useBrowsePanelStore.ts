/**
 * Zustand store for managing the Browse (Spotify Search) panel state.
 * Handles open/close state and search query persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ImportSource, LastfmPeriod } from '@/lib/importers/types';

export type BrowseTab = 'spotify' | 'lastfm';

interface BrowsePanelState {
  /** Whether the browse panel is open */
  isOpen: boolean;
  /** Active tab (Spotify search or Last.fm import) */
  activeTab: BrowseTab;
  /** Current search query */
  searchQuery: string;
  /** Panel width in pixels */
  width: number;
  /** Whether the recommendations panel is expanded */
  recsExpanded: boolean;
  /** Height of the recommendations panel in pixels (when expanded) */
  recsHeight: number;
  
  // Last.fm specific state
  /** Last.fm username for import */
  lastfmUsername: string;
  /** Last.fm import source type */
  lastfmSource: ImportSource;
  /** Last.fm period for top tracks */
  lastfmPeriod: LastfmPeriod;
  /** Selected Last.fm track indices for multi-select */
  lastfmSelection: Set<number>;
  /** Selected Spotify search track indices for multi-select */
  spotifySelection: Set<number>;
  
  // Actions
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveTab: (tab: BrowseTab) => void;
  setSearchQuery: (query: string) => void;
  setWidth: (width: number) => void;
  setRecsExpanded: (expanded: boolean) => void;
  toggleRecsExpanded: () => void;
  setRecsHeight: (height: number) => void;
  
  // Last.fm actions
  setLastfmUsername: (username: string) => void;
  setLastfmSource: (source: ImportSource) => void;
  setLastfmPeriod: (period: LastfmPeriod) => void;
  setLastfmSelection: (selection: Set<number>) => void;
  toggleLastfmSelection: (index: number) => void;
  clearLastfmSelection: () => void;
  
  // Spotify selection actions
  setSpotifySelection: (selection: Set<number>) => void;
  toggleSpotifySelection: (index: number) => void;
  clearSpotifySelection: () => void;
}

export const useBrowsePanelStore = create<BrowsePanelState>()(
  persist(
    (set) => ({
      isOpen: false,
      activeTab: 'spotify',
      searchQuery: '',
      width: 400,
      recsExpanded: false,
      recsHeight: 300,
      
      // Last.fm defaults
      lastfmUsername: '',
      lastfmSource: 'lastfm-recent',
      lastfmPeriod: '3month',
      lastfmSelection: new Set(),
      spotifySelection: new Set(),
      
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setWidth: (width) => set({ width: Math.max(300, Math.min(800, width)) }),
      setRecsExpanded: (expanded) => set({ recsExpanded: expanded }),
      toggleRecsExpanded: () => set((state) => ({ recsExpanded: !state.recsExpanded })),
      setRecsHeight: (height) => set({ recsHeight: Math.max(150, Math.min(500, height)) }),
      
      // Last.fm actions
      setLastfmUsername: (username) => set({ lastfmUsername: username }),
      setLastfmSource: (source) => set({ lastfmSource: source, lastfmSelection: new Set() }),
      setLastfmPeriod: (period) => set({ lastfmPeriod: period }),
      setLastfmSelection: (selection) => set({ lastfmSelection: selection }),
      toggleLastfmSelection: (index) => set((state) => {
        const newSelection = new Set(state.lastfmSelection);
        if (newSelection.has(index)) {
          newSelection.delete(index);
        } else {
          newSelection.add(index);
        }
        return { lastfmSelection: newSelection };
      }),
      clearLastfmSelection: () => set({ lastfmSelection: new Set() }),
      
      // Spotify selection actions
      setSpotifySelection: (selection) => set({ spotifySelection: selection }),
      toggleSpotifySelection: (index) => set((state) => {
        const newSelection = new Set(state.spotifySelection);
        if (newSelection.has(index)) {
          newSelection.delete(index);
        } else {
          newSelection.add(index);
        }
        return { spotifySelection: newSelection };
      }),
      clearSpotifySelection: () => set({ spotifySelection: new Set() }),
    }),
    {
      name: 'browse-panel-storage',
      partialize: (state) => ({
        isOpen: state.isOpen,
        activeTab: state.activeTab,
        width: state.width,
        recsExpanded: state.recsExpanded,
        recsHeight: state.recsHeight,
        lastfmUsername: state.lastfmUsername,
        lastfmSource: state.lastfmSource,
        lastfmPeriod: state.lastfmPeriod,
        // Don't persist searchQuery or selection - start fresh each session
      }),
    }
  )
);
