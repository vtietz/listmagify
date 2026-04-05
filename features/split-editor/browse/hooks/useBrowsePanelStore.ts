/**
 * Zustand store for managing the Browse (Spotify Search) panel state.
 * Handles open/close state and search query persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ImportSource, LastfmPeriod } from '@/lib/importers/types';
import type { Image, MusicProviderId, SearchFilterType } from '@/lib/music-provider/types';

export type BrowseTab = 'browse' | 'lastfm';

export type DrillDownTarget = {
  type: 'artist' | 'album';
  id: string;
  name: string;
  image?: Image | null;
};

type BrowseProviderSearchState = {
  searchQuery: string;
  searchFilter: SearchFilterType;
  drillDown: DrillDownTarget | null;
};

const DEFAULT_PROVIDER_SEARCH_STATE: Record<MusicProviderId, BrowseProviderSearchState> = {
  spotify: {
    searchQuery: '',
    searchFilter: 'tracks',
    drillDown: null,
  },
  tidal: {
    searchQuery: '',
    searchFilter: 'all',
    drillDown: null,
  },
};

interface BrowsePanelState {
  /** Whether the browse panel is open */
  isOpen: boolean;
  /** Active tab (Browse search or Last.fm import) */
  activeTab: BrowseTab;
  /** Which music provider to search in the browse tab */
  providerId: MusicProviderId;
  /** Current search query */
  searchQuery: string;
  /** Search filter type (tracks, artists, albums) */
  searchFilter: SearchFilterType;
  /** Search state by provider for quick switching */
  searchStateByProvider: Record<MusicProviderId, BrowseProviderSearchState>;
  /** Drill-down target (artist or album to show tracks for) */
  drillDown: DrillDownTarget | null;
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
  /** Selected Last.fm track indices for multi-select (ordered array preserves selection order) */
  lastfmSelection: number[];
  /** Anchor index for shift-click range selection */
  lastfmAnchorIndex: number | null;
  /** Selected Spotify search track indices for multi-select (ordered array preserves selection order) */
  spotifySelection: number[];
  
  // Actions
  toggle: () => void;
  open: () => void;
  close: () => void;
  setActiveTab: (tab: BrowseTab) => void;
  setProviderId: (providerId: MusicProviderId) => void;
  setSearchQuery: (query: string) => void;
  setSearchFilter: (filter: SearchFilterType) => void;
  setDrillDown: (target: DrillDownTarget) => void;
  clearDrillDown: () => void;
  setWidth: (width: number) => void;
  setRecsExpanded: (expanded: boolean) => void;
  toggleRecsExpanded: () => void;
  setRecsHeight: (height: number) => void;
  
  // Last.fm actions
  setLastfmUsername: (username: string) => void;
  setLastfmSource: (source: ImportSource) => void;
  setLastfmPeriod: (period: LastfmPeriod) => void;
  setLastfmSelection: (selection: number[]) => void;
  toggleLastfmSelection: (index: number) => void;
  selectLastfmRange: (fromIndex: number, toIndex: number) => void;
  clearLastfmSelection: () => void;
  
  // Spotify selection actions
  setSpotifySelection: (selection: number[]) => void;
  toggleSpotifySelection: (index: number) => void;
  clearSpotifySelection: () => void;
}

export const useBrowsePanelStore = create<BrowsePanelState>()(
  persist(
    (set) => ({
      isOpen: false,
      activeTab: 'browse',
      providerId: 'spotify',
      searchQuery: DEFAULT_PROVIDER_SEARCH_STATE.spotify.searchQuery,
      searchFilter: DEFAULT_PROVIDER_SEARCH_STATE.spotify.searchFilter,
      searchStateByProvider: DEFAULT_PROVIDER_SEARCH_STATE,
      drillDown: null,
      width: 400,
      recsExpanded: false,
      recsHeight: 300,
      
      // Last.fm defaults
      lastfmUsername: '',
      lastfmSource: 'lastfm-recent',
      lastfmPeriod: '3month',
      lastfmSelection: [],
      lastfmAnchorIndex: null,
      spotifySelection: [],
      
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setProviderId: (providerId) => set((state) => {
        // Save outgoing provider's current state
        const updatedStateByProvider = {
          ...state.searchStateByProvider,
          [state.providerId]: {
            searchQuery: state.searchQuery,
            searchFilter: state.searchFilter,
            drillDown: state.drillDown,
          },
        };
        // Restore incoming provider's state
        const incoming = updatedStateByProvider[providerId] ?? DEFAULT_PROVIDER_SEARCH_STATE[providerId];
        return {
          providerId,
          searchQuery: incoming.searchQuery,
          searchFilter: incoming.searchFilter,
          drillDown: incoming.drillDown,
          spotifySelection: [],
          searchStateByProvider: updatedStateByProvider,
        };
      }),
      setSearchQuery: (query) => set((state) => {
        // Skip no-op writes to avoid clearing drillDown when the debounced
        // search effect fires on mount with the same value already in the store.
        if (state.searchQuery === query) return {};
        return {
          searchQuery: query,
          drillDown: null,
          searchStateByProvider: {
            ...state.searchStateByProvider,
            [state.providerId]: {
              ...state.searchStateByProvider[state.providerId],
              searchQuery: query,
              drillDown: null,
            },
          },
        };
      }),
      setSearchFilter: (filter) => set((state) => ({
        searchFilter: filter,
        spotifySelection: [],
        drillDown: null,
        searchStateByProvider: {
          ...state.searchStateByProvider,
          [state.providerId]: {
            ...state.searchStateByProvider[state.providerId],
            searchFilter: filter,
            drillDown: null,
          },
        },
      })),
      setDrillDown: (target) => set((state) => ({
        drillDown: target,
        spotifySelection: [],
        searchStateByProvider: {
          ...state.searchStateByProvider,
          [state.providerId]: {
            ...state.searchStateByProvider[state.providerId],
            drillDown: target,
          },
        },
      })),
      clearDrillDown: () => set((state) => ({
        drillDown: null,
        spotifySelection: [],
        searchStateByProvider: {
          ...state.searchStateByProvider,
          [state.providerId]: {
            ...state.searchStateByProvider[state.providerId],
            drillDown: null,
          },
        },
      })),
      setWidth: (width) => set({ width: Math.max(300, Math.min(800, width)) }),
      setRecsExpanded: (expanded) => set({ recsExpanded: expanded }),
      toggleRecsExpanded: () => set((state) => ({ recsExpanded: !state.recsExpanded })),
      setRecsHeight: (height) => set({ recsHeight: Math.max(150, Math.min(500, height)) }),
      
      // Last.fm actions
      setLastfmUsername: (username) => set({ lastfmUsername: username }),
      setLastfmSource: (source) => set({ lastfmSource: source, lastfmSelection: [], lastfmAnchorIndex: null }),
      setLastfmPeriod: (period) => set({ lastfmPeriod: period }),
      setLastfmSelection: (selection) => set({ lastfmSelection: selection }),
      toggleLastfmSelection: (index) => set((state) => {
        const idx = state.lastfmSelection.indexOf(index);
        if (idx >= 0) {
          // Remove from selection
          return { lastfmSelection: state.lastfmSelection.filter((_, i) => i !== idx), lastfmAnchorIndex: index };
        } else {
          // Add to end (preserves selection order)
          return { lastfmSelection: [...state.lastfmSelection, index], lastfmAnchorIndex: index };
        }
      }),
      selectLastfmRange: (fromIndex, toIndex) => set((state) => {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        // Create range of indices
        const rangeIndices: number[] = [];
        for (let i = start; i <= end; i++) {
          rangeIndices.push(i);
        }
        // Merge with existing selection (add new indices not already selected)
        const newSelection = [...state.lastfmSelection];
        for (const idx of rangeIndices) {
          if (!newSelection.includes(idx)) {
            newSelection.push(idx);
          }
        }
        return { lastfmSelection: newSelection, lastfmAnchorIndex: toIndex };
      }),
      clearLastfmSelection: () => set({ lastfmSelection: [], lastfmAnchorIndex: null }),
      
      // Spotify selection actions
      setSpotifySelection: (selection) => set({ spotifySelection: selection }),
      toggleSpotifySelection: (index) => set((state) => {
        const idx = state.spotifySelection.indexOf(index);
        if (idx >= 0) {
          // Remove from selection
          return { spotifySelection: state.spotifySelection.filter((_, i) => i !== idx) };
        } else {
          // Add to end (preserves selection order)
          return { spotifySelection: [...state.spotifySelection, index] };
        }
      }),
      clearSpotifySelection: () => set({ spotifySelection: [] }),
    }),
    {
      name: 'browse-panel-storage',
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // Rename old 'spotify' tab to 'browse'
          if (state.activeTab === 'spotify') {
            state.activeTab = 'browse';
          }
        }
        if (version < 3) {
          state.searchStateByProvider = DEFAULT_PROVIDER_SEARCH_STATE;
          state.searchQuery = DEFAULT_PROVIDER_SEARCH_STATE.spotify.searchQuery;
          state.searchFilter = DEFAULT_PROVIDER_SEARCH_STATE.spotify.searchFilter;
        }
        return state as unknown as BrowsePanelState;
      },
      partialize: (state) => ({
        isOpen: state.isOpen,
        activeTab: state.activeTab,
        width: state.width,
        recsExpanded: state.recsExpanded,
        recsHeight: state.recsHeight,
        lastfmUsername: state.lastfmUsername,
        lastfmSource: state.lastfmSource,
        lastfmPeriod: state.lastfmPeriod,
        // Don't persist searchQuery, selection, or providerId - start fresh each session
      }),
    }
  )
);
