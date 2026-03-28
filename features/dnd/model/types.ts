/**
 * DnD Orchestrator Types
 *
 * Shared type definitions for drag-and-drop orchestration
 */

import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { Virtualizer } from '@tanstack/react-virtual';

export interface TrackPayload {
  title: string;
  artists: string[];
  normalizedArtists: string[];
  album: string | null;
  durationSec: number;
  isrc?: string | undefined;
  year?: number | undefined;
  sourceProvider?: MusicProviderId;
  sourceProviderId?: string | undefined;
  sourceProviderUri?: string | undefined;
  coverUrl?: string | undefined;
}

/**
 * Minimal panel configuration required for DnD operations.
 * Compatible with the full PanelConfig from useSplitGridStore.
 */
export interface PanelConfig {
  id: string;
  providerId?: MusicProviderId;
  playlistId: string | null;
  isEditable: boolean;
  dndMode?: 'move' | 'copy';
  selection?: Set<string>;
}

/**
 * Panel data stored in virtualizer registry
 */
export interface PanelVirtualizerData {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollRef: { current: HTMLDivElement | null };
  filteredTracks: Track[];
  canDrop: boolean; // Whether this panel accepts drops (false when sorted)
}

/**
 * Ephemeral insertion state for "make room" animation
 */
export interface EphemeralInsertion {
  activeId: string; // Composite ID
  sourcePanelId: string;
  targetPanelId: string;
  insertionIndex: number;
}

/**
 * Track with positions for precise removal (handles duplicate tracks)
 */
export interface TrackWithPositions {
  uri: string;
  positions: number[];
}

/**
 * Result from drop position calculation
 */
export interface DropPositionResult {
  filteredIndex: number;
  globalPosition: number;
}
