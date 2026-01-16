/**
 * Split Tree Operations Module
 * 
 * Pure functions for manipulating the split tree structure.
 * Extracted from useSplitGridStore for better testability and modularity.
 */

import type { SplitNode, GroupNode, PanelConfig } from './types';
import { generatePanelId, generateGroupId, createPanelNode } from './types';

/**
 * Flatten the tree to get all panel configs.
 * Used by orchestrator and other consumers needing a flat list.
 */
export function flattenPanels(node: SplitNode | null): PanelConfig[] {
  if (!node) return [];
  
  if (node.kind === 'panel') {
    return [node.panel];
  }
  
  return node.children.flatMap(flattenPanels);
}

/**
 * Count total panels in tree.
 */
export function countPanels(node: SplitNode | null): number {
  if (!node) return 0;
  if (node.kind === 'panel') return 1;
  return node.children.reduce((sum: number, child: SplitNode) => sum + countPanels(child), 0);
}

/**
 * Update a panel in the tree immutably.
 * 
 * @param node - Root node of the tree
 * @param panelId - ID of the panel to update
 * @param updater - Function to update the panel config
 * @returns New tree with the updated panel
 */
export function updatePanelInTree(
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
  const updatedChildren = node.children
    .map((child: SplitNode) => updatePanelInTree(child, panelId, updater))
    .filter((child: SplitNode | null): child is SplitNode => child !== null);
  
  return { ...node, children: updatedChildren };
}

/**
 * Clone a panel config with a new ID and cleared selection.
 * Preserves scroll position but clears selection.
 */
function clonePanelConfig(source: PanelConfig): PanelConfig {
  return {
    ...source,
    id: generatePanelId(),
    selection: new Set(), // Clear selection in clone
    scrollOffset: source.scrollOffset, // Preserve scroll position
  };
}

/**
 * Split a panel, creating a group with the original and a clone.
 * 
 * @param node - Root node of the tree
 * @param panelId - ID of the panel to split
 * @param orientation - Direction of the split ('horizontal' | 'vertical')
 * @returns New tree with the panel split
 */
export function splitPanelInTree(
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
  const updatedChildren = node.children
    .map((child: SplitNode) => splitPanelInTree(child, panelId, orientation))
    .filter((child: SplitNode | null): child is SplitNode => child !== null);
  
  return { ...node, children: updatedChildren };
}

/**
 * Remove a panel and collapse groups with single children.
 * 
 * @param node - Root node of the tree
 * @param panelId - ID of the panel to remove
 * @returns New tree with the panel removed, or null if tree is empty
 */
export function removePanelFromTree(node: SplitNode | null, panelId: string): SplitNode | null {
  if (!node) return null;
  
  if (node.kind === 'panel') {
    // If this is the panel to remove, return null
    return node.panel.id === panelId ? null : node;
  }
  
  // Group node - recurse into children
  const updatedChildren = node.children
    .map((child: SplitNode) => removePanelFromTree(child, panelId))
    .filter((child: SplitNode | null): child is SplitNode => child !== null);
  
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

/**
 * Find a panel by ID in the tree.
 * 
 * @param node - Root node of the tree
 * @param panelId - ID of the panel to find
 * @returns The panel config if found, undefined otherwise
 */
export function findPanelById(node: SplitNode | null, panelId: string): PanelConfig | undefined {
  if (!node) return undefined;
  
  if (node.kind === 'panel') {
    return node.panel.id === panelId ? node.panel : undefined;
  }
  
  for (const child of node.children) {
    const found = findPanelById(child, panelId);
    if (found) return found;
  }
  
  return undefined;
}

/**
 * Get the first panel in the tree (DFS order).
 * 
 * @param node - Root node of the tree
 * @returns The first panel config, or undefined if tree is empty
 */
export function getFirstPanel(node: SplitNode | null): PanelConfig | undefined {
  if (!node) return undefined;
  
  if (node.kind === 'panel') {
    return node.panel;
  }
  
  for (const child of node.children) {
    const first = getFirstPanel(child);
    if (first) return first;
  }
  
  return undefined;
}
