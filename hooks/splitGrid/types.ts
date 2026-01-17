/**
 * Split Grid Types Module
 * 
 * Type definitions and factory functions for split grid structures.
 * Extracted from useSplitGridStore for better modularity.
 */

import type { SortKey, SortDirection } from '@/lib/utils/sort';

// Re-export for convenience
export type { SortKey, SortDirection };

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
  sortKey: SortKey;
  sortDirection: SortDirection;
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
// Factory Functions
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
