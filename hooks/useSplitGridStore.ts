/**
 * Zustand store for managing split grid state with tree-based layout:
 * - Split tree model for nested horizontal/vertical splits
 * - Panel configurations (playlist, search, selection, scroll)
 * - Actions for splitting, closing, and managing panels
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Import types and helpers from modular files
import {
  type PanelConfig,
  type PanelNode,
  type GroupNode,
  type SplitNode,
  generatePanelId,
  generateGroupId,
  createPanelConfig,
  createPanelNode,
} from './splitGrid/types';

import {
  flattenPanels,
  countPanels,
  updatePanelInTree,
  splitPanelInTree,
  removePanelFromTree,
} from './splitGrid/tree';

import { serializeTree, deserializeTree } from './splitGrid/persistence';
import { migrateLegacyPanels } from './splitGrid/migrate';

// Re-export types and functions for external consumers
export type { PanelConfig, PanelNode, GroupNode, SplitNode };
export { 
  flattenPanels, 
  generatePanelId, 
  generateGroupId, 
  createPanelConfig, 
  createPanelNode,
  countPanels,
  updatePanelInTree,
  splitPanelInTree,
  removePanelFromTree,
};

// ============================================================================
// Store Interface
// ============================================================================

interface SplitGridState {
  /** Root of the split tree */
  root: SplitNode | null;
  
  /** Derived flat list of panels for compatibility */
  panels: PanelConfig[];

  // Tree Actions
  splitPanel: (panelId: string, orientation: 'horizontal' | 'vertical') => void;
  closePanel: (panelId: string) => void;
  
  // Panel Actions (operate on panels within the tree)
  loadPlaylist: (panelId: string, playlistId: string, isEditable: boolean) => void;
  selectPlaylist: (panelId: string, playlistId: string) => void;
  initializeSinglePanel: (playlistId: string) => void;
  initializeFromRoot: (root: SplitNode) => void;
  setSearch: (panelId: string, query: string) => void;
  setSelection: (panelId: string, trackIds: string[]) => void;
  toggleSelection: (panelId: string, trackId: string) => void;
  setScroll: (panelId: string, offset: number) => void;
  setPanelDnDMode: (panelId: string, mode: 'move' | 'copy') => void;
  togglePanelLock: (panelId: string) => void;
  setSort: (panelId: string, sortKey: PanelConfig['sortKey'], sortDirection: 'asc' | 'desc') => void;
  
  // Legacy actions (for compatibility)
  addSplit: (direction: 'horizontal' | 'vertical') => void;
  clonePanel: (panelId: string, direction: 'horizontal' | 'vertical') => void;
  
  reset: () => void;
}

const MAX_PANELS = 16;

// ============================================================================
// Store Implementation
// ============================================================================

export const useSplitGridStore = create<SplitGridState>()(
  persist(
    (set, get) => ({
      root: null,
      panels: [],

      splitPanel: (panelId, orientation) => {
        const { root } = get();
        if (countPanels(root) >= MAX_PANELS) return;
        
        const newRoot = splitPanelInTree(root, panelId, orientation);
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      closePanel: (panelId) => {
        const { root } = get();
        const newRoot = removePanelFromTree(root, panelId);
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      loadPlaylist: (panelId, playlistId, isEditable) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          playlistId,
          isEditable,
          searchQuery: '',
          scrollOffset: 0,
          selection: new Set(),
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      selectPlaylist: (panelId, playlistId) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          playlistId,
          isEditable: false, // Will be updated by PlaylistPanel after permissions check
          searchQuery: '',
          scrollOffset: 0,
          selection: new Set(),
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      initializeSinglePanel: (playlistId) => {
        const panel = createPanelConfig(playlistId);
        const panelNode = createPanelNode(panel);
        set({ 
          root: panelNode,
          panels: [panel],
        });
      },

      initializeFromRoot: (root) => {
        set({
          root,
          panels: flattenPanels(root),
        });
      },

      setSearch: (panelId, query) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          searchQuery: query,
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      setSelection: (panelId, trackIds) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          selection: new Set(trackIds),
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      toggleSelection: (panelId, trackId) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => {
          const newSelection = new Set(panel.selection);
          if (newSelection.has(trackId)) {
            newSelection.delete(trackId);
          } else {
            newSelection.add(trackId);
          }
          return { ...panel, selection: newSelection };
        });
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      setScroll: (panelId, offset) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          scrollOffset: offset,
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      setPanelDnDMode: (panelId, mode) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          dndMode: mode,
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      togglePanelLock: (panelId) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          locked: !panel.locked,
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      setSort: (panelId, sortKey, sortDirection) => {
        const { root } = get();
        const newRoot = updatePanelInTree(root, panelId, (panel) => ({
          ...panel,
          sortKey,
          sortDirection,
        }));
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      // Legacy: Add a new empty panel (creates a horizontal group at root)
      addSplit: (direction) => {
        const { root } = get();
        if (countPanels(root) >= MAX_PANELS) return;
        
        const newPanel = createPanelConfig();
        const newPanelNode = createPanelNode(newPanel);
        
        if (!root) {
          // No root yet - just set the new panel as root
          set({ root: newPanelNode, panels: [newPanel] });
          return;
        }
        
        // Wrap existing root in a group with the new panel
        const newRoot: GroupNode = {
          kind: 'group',
          id: generateGroupId(),
          orientation: direction,
          children: [root, newPanelNode],
        };
        
        set({ 
          root: newRoot,
          panels: flattenPanels(newRoot),
        });
      },

      // Legacy: Clone a panel (now calls splitPanel)
      clonePanel: (panelId, direction) => {
        get().splitPanel(panelId, direction);
      },

      reset: () => {
        set({ root: null, panels: [] });
      },
    }),
    {
      name: 'split-grid-storage',
      partialize: (state) => ({
        root: serializeTree(state.root),
        // Don't persist panels array - it's derived
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        
        // Check for legacy panels array in stored data
        const storedData = localStorage.getItem('split-grid-storage');
        if (storedData) {
          try {
            const parsed = JSON.parse(storedData);
            
            // If we have legacy panels but no root, migrate
            if (parsed.state?.panels && !parsed.state?.root) {
              const migratedRoot = migrateLegacyPanels(parsed.state.panels);
              state.root = migratedRoot;
              state.panels = flattenPanels(migratedRoot);
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
        
        // Deserialize the tree
        if (state.root) {
          state.root = deserializeTree(state.root);
          state.panels = flattenPanels(state.root);
        }
      },
    }
  )
);

export const MAX_PANELS_LIMIT = MAX_PANELS;
