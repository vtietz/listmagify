/**
 * Split Grid Migration Module
 * 
 * Functions for migrating legacy data formats to the current tree structure.
 * Extracted from useSplitGridStore for better modularity.
 */

import type { SplitNode, PanelConfig, GroupNode } from './types';
import { generatePanelId, generateGroupId, createPanelNode } from './types';

function readStringField(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : fallback;
}

function readNullableStringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' ? value : null;
}

function readBooleanField(data: Record<string, unknown>, key: string): boolean {
  return data[key] === true;
}

function readNumberField(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === 'number' ? value : fallback;
}

function readProviderField(data: Record<string, unknown>): 'spotify' | 'tidal' {
  const value = data.providerId;
  return value === 'tidal' ? 'tidal' : 'spotify';
}

function readSelectionField(data: Record<string, unknown>): Set<string> {
  const value = data.selection;
  return new Set(Array.isArray(value) ? value : []);
}

function readDndModeField(data: Record<string, unknown>): 'move' | 'copy' {
  return data.dndMode === 'move' ? 'move' : 'copy';
}

function readSortDirectionField(data: Record<string, unknown>): 'asc' | 'desc' {
  return data.sortDirection === 'desc' ? 'desc' : 'asc';
}

function toLegacyPanelConfig(panelLike: unknown): PanelConfig {
  const panelData = panelLike as Record<string, unknown>;
  const providerId = readProviderField(panelData);
  const playlistId = readNullableStringField(panelData, 'playlistId');
  const lastPlaylistByProvider = playlistId ? { [providerId]: playlistId } : {};

  return {
    id: readStringField(panelData, 'id', generatePanelId()),
    providerId,
    playlistId,
    lastPlaylistByProvider,
    isEditable: readBooleanField(panelData, 'isEditable'),
    locked: readBooleanField(panelData, 'locked'),
    searchQuery: readStringField(panelData, 'searchQuery', ''),
    scrollOffset: readNumberField(panelData, 'scrollOffset', 0),
    selection: readSelectionField(panelData),
    dndMode: readDndModeField(panelData),
    sortKey: readStringField(panelData, 'sortKey', 'position') as PanelConfig['sortKey'],
    sortDirection: readSortDirectionField(panelData),
  };
}

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
  const panelNodes = panels.map((panelLike: unknown) => createPanelNode(toLegacyPanelConfig(panelLike)));
  
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
