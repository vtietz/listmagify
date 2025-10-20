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
  searchQuery: string;
  scrollOffset: number;
  selection: Set<string>;
}

interface GridLayout {
  rows: number;
  cols: number;
}

interface SplitGridState {
  panels: PanelConfig[];
  globalDnDMode: 'move' | 'copy';
  containerWidth: number;
  containerHeight: number;

  // Actions
  addSplit: (direction: 'horizontal' | 'vertical') => void;
  closePanel: (panelId: string) => void;
  loadPlaylist: (panelId: string, playlistId: string, isEditable: boolean) => void;
  setSearch: (panelId: string, query: string) => void;
  setSelection: (panelId: string, trackIds: string[]) => void;
  toggleSelection: (panelId: string, trackId: string) => void;
  setScroll: (panelId: string, offset: number) => void;
  setGlobalDnDMode: (mode: 'move' | 'copy') => void;
  setContainerSize: (width: number, height: number) => void;
  getLayout: () => GridLayout;
  reset: () => void;
}

const MIN_PANEL_WIDTH = 350;
const MIN_PANEL_HEIGHT = 240;
const MAX_PANELS = 16;

function generatePanelId(): string {
  return `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function computeLayout(
  panelCount: number,
  containerWidth: number,
  containerHeight: number
): GridLayout {
  if (panelCount === 0) return { rows: 0, cols: 0 };
  if (panelCount === 1) return { rows: 1, cols: 1 };

  const maxCols = Math.floor(containerWidth / MIN_PANEL_WIDTH) || 1;
  const maxRows = Math.floor(containerHeight / MIN_PANEL_HEIGHT) || 1;

  // Try to create a square-ish layout
  let cols = Math.min(Math.ceil(Math.sqrt(panelCount)), maxCols);
  let rows = Math.ceil(panelCount / cols);

  // Verify fit
  while (rows > maxRows && cols < maxCols) {
    cols++;
    rows = Math.ceil(panelCount / cols);
  }

  // If still doesn't fit, reduce cols
  while (rows > maxRows && cols > 1) {
    cols--;
    rows = Math.ceil(panelCount / cols);
  }

  return { rows: Math.min(rows, maxRows), cols: Math.min(cols, maxCols) };
}

export const useSplitGridStore = create<SplitGridState>()(
  persist(
    (set, get) => ({
      panels: [],
      globalDnDMode: 'copy',
      containerWidth: 1200,
      containerHeight: 800,

      addSplit: (direction) => {
        const { panels } = get();
        if (panels.length >= MAX_PANELS) {
          return;
        }

        const newPanel: PanelConfig = {
          id: generatePanelId(),
          playlistId: null,
          isEditable: false,
          searchQuery: '',
          scrollOffset: 0,
          selection: new Set(),
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

      setGlobalDnDMode: (mode) => {
        set({ globalDnDMode: mode });
      },

      setContainerSize: (width, height) => {
        set({ containerWidth: width, containerHeight: height });
      },

      getLayout: () => {
        const { panels, containerWidth, containerHeight } = get();
        return computeLayout(panels.length, containerWidth, containerHeight);
      },

      reset: () => {
        set({
          panels: [],
          globalDnDMode: 'copy',
          containerWidth: 1200,
          containerHeight: 800,
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
        globalDnDMode: state.globalDnDMode,
      }),
      onRehydrateStorage: () => (state) => {
        // Convert arrays back to Sets after rehydration
        if (state?.panels) {
          state.panels = state.panels.map((p: PanelConfig) => ({
            ...p,
            selection: new Set(Array.isArray(p.selection) ? p.selection : []),
          }));
        }
      },
    }
  )
);

export const MAX_PANELS_LIMIT = MAX_PANELS;
