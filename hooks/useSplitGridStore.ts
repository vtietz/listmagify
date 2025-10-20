/**
 * Zustand store for managing split grid state:
 * - Panel configurations (playlist, search, selection, scroll)
 * - Grid layout computation
 * - Global DnD mode (move/copy)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PanelConfig {
  id: string;
  playlistId: string | null;
  isEditable: boolean;
  locked: boolean; // User-controlled lock (prevents dragging tracks from this panel)
  searchQuery: string;
  scrollOffset: number;
  selection: Set<string>;
  dndMode: 'move' | 'copy';
}

interface SplitGridState {
  panels: PanelConfig[];

  // Actions
  addSplit: (direction: 'horizontal' | 'vertical') => void;
  clonePanel: (panelId: string, direction: 'horizontal' | 'vertical') => void;
  closePanel: (panelId: string) => void;
  loadPlaylist: (panelId: string, playlistId: string, isEditable: boolean) => void;
  selectPlaylist: (panelId: string, playlistId: string) => void;
  initializeSinglePanel: (playlistId: string) => void;
  setSearch: (panelId: string, query: string) => void;
  setSelection: (panelId: string, trackIds: string[]) => void;
  toggleSelection: (panelId: string, trackId: string) => void;
  setScroll: (panelId: string, offset: number) => void;
  setPanelDnDMode: (panelId: string, mode: 'move' | 'copy') => void;
  togglePanelLock: (panelId: string) => void;
  reset: () => void;
}

const MAX_PANELS = 16;

function generatePanelId(): string {
  return `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const useSplitGridStore = create<SplitGridState>()(
  persist(
    (set, get) => ({
      panels: [],

      addSplit: (direction) => {
        const { panels } = get();
        if (panels.length >= MAX_PANELS) {
          return;
        }

        const newPanel: PanelConfig = {
          id: generatePanelId(),
          playlistId: null,
          isEditable: false,
          locked: false,
          searchQuery: '',
          scrollOffset: 0,
          selection: new Set(),
          dndMode: 'copy',
        };

        set({ panels: [...panels, newPanel] });
      },

      clonePanel: (panelId, direction) => {
        const { panels } = get();
        if (panels.length >= MAX_PANELS) {
          return;
        }

        const sourcePanel = panels.find((p) => p.id === panelId);
        if (!sourcePanel) return;

        const newPanel: PanelConfig = {
          id: generatePanelId(),
          playlistId: sourcePanel.playlistId,
          isEditable: sourcePanel.isEditable,
          locked: sourcePanel.locked,
          searchQuery: sourcePanel.searchQuery,
          scrollOffset: sourcePanel.scrollOffset,
          selection: new Set(), // Clear selection in clone
          dndMode: sourcePanel.dndMode,
        };

        set({ panels: [...panels, newPanel] });
      },

      closePanel: (panelId) => {
        const { panels } = get();
        set({ panels: panels.filter((p) => p.id !== panelId) });
      },

      loadPlaylist: (panelId, playlistId, isEditable) => {
        const { panels } = get();
        set({
          panels: panels.map((p) =>
            p.id === panelId
              ? { ...p, playlistId, isEditable, searchQuery: '', scrollOffset: 0, selection: new Set() }
              : p
          ),
        });
      },

      selectPlaylist: (panelId, playlistId) => {
        const { panels } = get();
        set({
          panels: panels.map((p) =>
            p.id === panelId
              ? {
                  ...p,
                  playlistId,
                  isEditable: false, // Will be updated by PlaylistPanel after permissions check
                  searchQuery: '',
                  scrollOffset: 0,
                  selection: new Set(),
                }
              : p
          ),
        });
      },

      initializeSinglePanel: (playlistId) => {
        const newPanel: PanelConfig = {
          id: generatePanelId(),
          playlistId,
          isEditable: false, // Will be updated by PlaylistPanel after permissions check
          locked: false,
          searchQuery: '',
          scrollOffset: 0,
          selection: new Set(),
          dndMode: 'copy',
        };

        set({ panels: [newPanel] });
      },

      setSearch: (panelId, query) => {
        const { panels } = get();
        set({
          panels: panels.map((p) => (p.id === panelId ? { ...p, searchQuery: query } : p)),
        });
      },

      setSelection: (panelId, trackIds) => {
        const { panels } = get();
        set({
          panels: panels.map((p) =>
            p.id === panelId ? { ...p, selection: new Set(trackIds) } : p
          ),
        });
      },

      toggleSelection: (panelId, trackId) => {
        const { panels } = get();
        set({
          panels: panels.map((p) => {
            if (p.id === panelId) {
              const newSelection = new Set(p.selection);
              if (newSelection.has(trackId)) {
                newSelection.delete(trackId);
              } else {
                newSelection.add(trackId);
              }
              return { ...p, selection: newSelection };
            }
            return p;
          }),
        });
      },

      setScroll: (panelId, offset) => {
        const { panels } = get();
        set({
          panels: panels.map((p) => (p.id === panelId ? { ...p, scrollOffset: offset } : p)),
        });
      },

      setPanelDnDMode: (panelId, mode) => {
        const { panels } = get();
        set({
          panels: panels.map((p) => (p.id === panelId ? { ...p, dndMode: mode } : p)),
        });
      },

      togglePanelLock: (panelId) => {
        const { panels } = get();
        set({
          panels: panels.map((p) => 
            p.id === panelId ? { ...p, locked: !p.locked } : p
          ),
        });
      },

      reset: () => {
        set({
          panels: [],
        });
      },
    }),
    {
      name: 'split-grid-storage',
      partialize: (state) => ({
        panels: state.panels.map((p) => ({
          ...p,
          selection: Array.from(p.selection), // Convert Set to Array for serialization
        })),
      }),
      onRehydrateStorage: () => (state) => {
        // Convert arrays back to Sets after rehydration
        if (state?.panels) {
          state.panels = state.panels.map((p: PanelConfig) => ({
            ...p,
            selection: new Set(Array.isArray(p.selection) ? p.selection : []),
            dndMode: p.dndMode || 'copy', // Ensure dndMode exists for old state
          }));
        }
      },
    }
  )
);

export const MAX_PANELS_LIMIT = MAX_PANELS;
