/**
 * Zustand store for managing split grid state with tree-based layout:
 * - Split tree model for nested horizontal/vertical splits
 * - Panel configurations (playlist, search, selection, scroll)
 * - Actions for splitting, closing, and managing panels
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export interface PanelConfig {
  id: string;
  playlistId: string | null;
  isEditable: boolean;
  locked: boolean; // User-controlled lock (prevents dragging tracks from this panel)
  searchQuery: string;
  scrollOffset: number;
  selection: Set<string>;
  dndMode: 'move' | 'copy';
  sortKey: 'position' | 'title' | 'artist' | 'album' | 'addedAt' | 'duration';
  sortDirection: 'asc' | 'desc';
}

/** A leaf node containing a panel */
export interface PanelNode {
  kind: 'panel';
  id: string;
  panel: PanelConfig;
}

/** A group node containing children arranged by orientation */
export interface GroupNode {
  kind: 'group';
  id: string;
  orientation: 'horizontal' | 'vertical';
  children: SplitNode[];
}

/** A node in the split tree - either a panel or a group */
export type SplitNode = PanelNode | GroupNode;

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generatePanelId(): string {
  return `panel-${generateId()}`;
}

export function generateGroupId(): string {
  return `group-${generateId()}`;
}

/** Create a new empty panel config */
export function createPanelConfig(playlistId: string | null = null): PanelConfig {
  return {
    id: generatePanelId(),
    playlistId,
    isEditable: false,
    locked: false,
    searchQuery: '',
    scrollOffset: 0,
    selection: new Set(),
    dndMode: 'copy',
    sortKey: 'position',
    sortDirection: 'asc',
  };
}

/** Create a panel node from a panel config */
export function createPanelNode(panel: PanelConfig): PanelNode {
  return {
    kind: 'panel',
    id: panel.id,
    panel,
  };
}

/** Clone a panel config with a new ID and cleared selection */
function clonePanelConfig(source: PanelConfig): PanelConfig {
  return {
    ...source,
    id: generatePanelId(),
    selection: new Set(), // Clear selection in clone
  };
}

/** Flatten the tree to get all panel configs (for orchestrator and legacy consumers) */
export function flattenPanels(node: SplitNode | null): PanelConfig[] {
  if (!node) return [];
  
  if (node.kind === 'panel') {
    return [node.panel];
  }
  
  return node.children.flatMap(flattenPanels);
}

/** Count total panels in tree */
function countPanels(node: SplitNode | null): number {
  if (!node) return 0;
  if (node.kind === 'panel') return 1;
  return node.children.reduce((sum, child) => sum + countPanels(child), 0);
}

/** Update a panel in the tree immutably */
function updatePanelInTree(
  node: SplitNode | null,
  panelId: string,
  updater: (panel: PanelConfig) => PanelConfig
): SplitNode | null {
  if (!node) return null;
  
  if (node.kind === 'panel') {
    if (node.panel.id === panelId) {
      const updatedPanel = updater(node.panel);
      return { ...node, panel: updatedPanel };
    }
    return node;
  }
  
  // Group node - recurse into children
  const updatedChildren = node.children.map(child => 
    updatePanelInTree(child, panelId, updater)
  ).filter((child): child is SplitNode => child !== null);
  
  return { ...node, children: updatedChildren };
}

/** Split a panel, creating a group with the original and a clone */
function splitPanelInTree(
  node: SplitNode | null,
  panelId: string,
  orientation: 'horizontal' | 'vertical'
): SplitNode | null {
  if (!node) return null;
  
  if (node.kind === 'panel') {
    if (node.panel.id === panelId) {
      // Found the panel to split - create a group with original + clone
      const clonedPanel = clonePanelConfig(node.panel);
      const newGroup: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation,
        children: [
          node, // Keep original panel
          createPanelNode(clonedPanel), // Add cloned panel
        ],
      };
      return newGroup;
    }
    return node;
  }
  
  // Group node - recurse into children
  const updatedChildren = node.children.map(child =>
    splitPanelInTree(child, panelId, orientation)
  ).filter((child): child is SplitNode => child !== null);
  
  return { ...node, children: updatedChildren };
}

/** Remove a panel and collapse groups with single children */
function removePanelFromTree(node: SplitNode | null, panelId: string): SplitNode | null {
  if (!node) return null;
  
  if (node.kind === 'panel') {
    // If this is the panel to remove, return null
    return node.panel.id === panelId ? null : node;
  }
  
  // Group node - recurse into children
  const updatedChildren = node.children
    .map(child => removePanelFromTree(child, panelId))
    .filter((child): child is SplitNode => child !== null);
  
  // If no children left, remove this group
  if (updatedChildren.length === 0) {
    return null;
  }
  
  // If only one child left, collapse the group
  if (updatedChildren.length === 1) {
    return updatedChildren[0]!;
  }
  
  return { ...node, children: updatedChildren };
}

/** Serialize tree for persistence (convert Sets to arrays) */
function serializeTree(node: SplitNode | null): unknown {
  if (!node) return null;
  
  if (node.kind === 'panel') {
    return {
      ...node,
      panel: {
        ...node.panel,
        selection: Array.from(node.panel.selection),
        sortKey: node.panel.sortKey,
        sortDirection: node.panel.sortDirection,
      },
    };
  }
  
  return {
    ...node,
    children: node.children.map(serializeTree),
  };
}

/** Deserialize tree from persistence (convert arrays back to Sets) */
function deserializeTree(data: unknown): SplitNode | null {
  if (!data || typeof data !== 'object') return null;
  
  const obj = data as Record<string, unknown>;
  
  if (obj.kind === 'panel') {
    const panel = obj.panel as Record<string, unknown>;
    return {
      kind: 'panel',
      id: obj.id as string,
      panel: {
        id: panel.id as string,
        playlistId: panel.playlistId as string | null,
        isEditable: panel.isEditable as boolean,
        locked: panel.locked as boolean,
        searchQuery: panel.searchQuery as string,
        scrollOffset: panel.scrollOffset as number,
        selection: new Set(Array.isArray(panel.selection) ? panel.selection : []),
        dndMode: (panel.dndMode as 'move' | 'copy') || 'copy',
        sortKey: (panel.sortKey as PanelConfig['sortKey']) || 'position',
        sortDirection: (panel.sortDirection as 'asc' | 'desc') || 'asc',
      },
    };
  }
  
  if (obj.kind === 'group') {
    const children = obj.children as unknown[];
    return {
      kind: 'group',
      id: obj.id as string,
      orientation: obj.orientation as 'horizontal' | 'vertical',
      children: children.map(deserializeTree).filter((c): c is SplitNode => c !== null),
    };
  }
  
  return null;
}

/** Migrate legacy panels array to tree structure */
function migrateLegacyPanels(panels: unknown[]): SplitNode | null {
  if (!panels || panels.length === 0) return null;
  
  // Convert legacy panel data to PanelConfigs
  const panelNodes: PanelNode[] = panels.map((p: unknown) => {
    const pObj = p as Record<string, unknown>;
    const panel: PanelConfig = {
      id: (pObj.id as string) || generatePanelId(),
      playlistId: (pObj.playlistId as string | null) || null,
      isEditable: (pObj.isEditable as boolean) || false,
      locked: (pObj.locked as boolean) || false,
      searchQuery: (pObj.searchQuery as string) || '',
      scrollOffset: (pObj.scrollOffset as number) || 0,
      selection: new Set(Array.isArray(pObj.selection) ? pObj.selection : []),
      dndMode: (pObj.dndMode as 'move' | 'copy') || 'copy',
      sortKey: (pObj.sortKey as PanelConfig['sortKey']) || 'position',
      sortDirection: (pObj.sortDirection as 'asc' | 'desc') || 'asc',
    };
    return createPanelNode(panel);
  });
  
  // If only one panel, return it directly
  if (panelNodes.length === 1) {
    return panelNodes[0]!;
  }
  
  // Multiple panels - create a horizontal group (side by side)
  return {
    kind: 'group',
    id: generateGroupId(),
    orientation: 'horizontal',
    children: panelNodes,
  };
}

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
