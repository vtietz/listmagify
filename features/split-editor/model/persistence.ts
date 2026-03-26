/**
 * Split Grid Persistence Module
 * 
 * Functions for serializing and deserializing the split tree for storage.
 * Extracted from useSplitGridStore for better modularity.
 */

import { isPlaylistIdCompatibleWithProvider } from '@/lib/providers/playlistIdCompat';
import type { SplitNode, PanelConfig } from './types';

function deserializeLastPlaylistByProvider(
  value: unknown,
  providerId: 'spotify' | 'tidal',
  playlistId: string | null,
): Partial<Record<'spotify' | 'tidal', string>> {
  const result: Partial<Record<'spotify' | 'tidal', string>> = {};

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;

    if (typeof source.spotify === 'string' && isPlaylistIdCompatibleWithProvider(source.spotify, 'spotify')) {
      result.spotify = source.spotify;
    }

    if (typeof source.tidal === 'string' && isPlaylistIdCompatibleWithProvider(source.tidal, 'tidal')) {
      result.tidal = source.tidal;
    }
  }

  if (playlistId && isPlaylistIdCompatibleWithProvider(playlistId, providerId)) {
    result[providerId] = playlistId;
  }

  return result;
}

/**
 * Serialize tree for persistence (convert Sets to arrays).
 * 
 * @param node - Root node of the tree
 * @returns Serializable representation of the tree
 */
export function serializeTree(node: SplitNode | null): unknown {
  if (!node) return null;
  
  if (node.kind === 'panel') {
    return {
      ...node,
      panel: {
        ...node.panel,
        selection: Array.from(node.panel.selection),
        sortKey: node.panel.sortKey,
        sortDirection: node.panel.sortDirection,
        lastPlaylistByProvider: node.panel.lastPlaylistByProvider,
      },
    };
  }
  
  return {
    ...node,
    children: node.children.map(serializeTree),
  };
}

/**
 * Deserialize tree from persistence (convert arrays back to Sets).
 * 
 * @param data - Serialized tree data from storage
 * @returns Deserialized SplitNode tree
 */
export function deserializeTree(data: unknown): SplitNode | null {
  if (!data || typeof data !== 'object') return null;
  
  const obj = data as Record<string, unknown>;
  
  if (obj.kind === 'panel') {
    const panel = obj.panel as Record<string, unknown>;
    const providerId = ((panel.providerId as 'spotify' | 'tidal') || 'spotify');
    const rawPlaylistId = panel.playlistId as string | null;
    // Clear playlist IDs that don't match the provider (e.g. Spotify ID on a TIDAL panel from stale state)
    const playlistId = isPlaylistIdCompatibleWithProvider(rawPlaylistId, providerId) ? rawPlaylistId : null;
    const lastPlaylistByProvider = deserializeLastPlaylistByProvider(panel.lastPlaylistByProvider, providerId, playlistId);
    return {
      kind: 'panel',
      id: obj.id as string,
      panel: {
        id: panel.id as string,
        providerId,
        playlistId,
        lastPlaylistByProvider,
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
