/**
 * Split Grid Migration Module
 * 
 * Functions for migrating legacy data formats to the current tree structure.
 * Extracted from useSplitGridStore for better modularity.
 */

import type { SplitNode, PanelConfig, GroupNode } from './types';
import { generatePanelId, generateGroupId, createPanelNode } from './types';

/**
 * Migrate legacy panels array to tree structure.
 * 
 * Handles data from older versions of the app that stored panels
 * as a flat array instead of a tree structure.
 * 
 * @param panels - Legacy panels array from storage
 * @returns Migrated tree structure
 */
export function migrateLegacyPanels(panels: unknown[]): SplitNode | null {
  if (!panels || panels.length === 0) return null;
  
  // Convert legacy panel data to PanelConfigs
  const panelNodes = panels.map((p: unknown) => {
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
  } as GroupNode;
}
