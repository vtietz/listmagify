/**
 * Zustand store for Compare Mode functionality.
 * Tracks presence of songs across multiple playlist panels and provides
 * color coding based on distribution.
 * 
 * Color scheme:
 * - Green (100%): Track exists in ALL panels
 * - Red (100%): Track exists in only ONE panel (unique)
 * - Yellow/intermediate: Track exists in some panels
 */

import { create } from 'zustand';

export interface TrackDistribution {
  /** Map of track URI to the set of panel IDs containing it */
  trackToPanels: Map<string, Set<string>>;
  /** Total number of playlist panels being compared */
  totalPanels: number;
  /** Set of panel IDs being compared */
  panelIds: Set<string>;
}

export interface CompareModeState {
  /** Whether compare mode is enabled */
  isEnabled: boolean;
  /** Map of panelId to their track URIs (only for playlist panels, not browse/recs) */
  panelTracks: Map<string, string[]>;
  /** Computed distribution (derived from panelTracks) */
  distribution: TrackDistribution | null;
  /** Toggle compare mode on/off */
  toggle: () => void;
  /** Enable compare mode */
  enable: () => void;
  /** Disable compare mode */
  disable: () => void;
  /** Register a panel's tracks for comparison */
  registerPanelTracks: (panelId: string, trackUris: string[]) => void;
  /** Unregister a panel from comparison */
  unregisterPanel: (panelId: string) => void;
}

/**
 * Compute track distribution from panel tracks map.
 */
function computeDistribution(panelTracks: Map<string, string[]>): TrackDistribution | null {
  if (panelTracks.size === 0) return null;
  
  const trackToPanels = new Map<string, Set<string>>();
  const panelIds = new Set<string>();

  for (const [panelId, trackUris] of panelTracks) {
    panelIds.add(panelId);
    for (const uri of trackUris) {
      if (!trackToPanels.has(uri)) {
        trackToPanels.set(uri, new Set());
      }
      trackToPanels.get(uri)!.add(panelId);
    }
  }

  return {
    trackToPanels,
    totalPanels: panelIds.size,
    panelIds,
  };
}

export const useCompareModeStore = create<CompareModeState>()((set, get) => ({
  isEnabled: false,
  panelTracks: new Map(),
  distribution: null,
  
  toggle: () => set((state) => ({ isEnabled: !state.isEnabled })),
  enable: () => set({ isEnabled: true }),
  disable: () => set({ isEnabled: false }),
  
  registerPanelTracks: (panelId: string, trackUris: string[]) => {
    const current = get().panelTracks;
    const newMap = new Map(current);
    newMap.set(panelId, trackUris);
    set({
      panelTracks: newMap,
      distribution: computeDistribution(newMap),
    });
  },
  
  unregisterPanel: (panelId: string) => {
    const current = get().panelTracks;
    if (!current.has(panelId)) return;
    const newMap = new Map(current);
    newMap.delete(panelId);
    set({
      panelTracks: newMap,
      distribution: computeDistribution(newMap),
    });
  },
}));

/**
 * Calculate color for a track based on its presence across panels.
 * 
 * @param panelsContainingTrack - Number of panels that contain this track
 * @param totalPanels - Total number of playlist panels being compared
 * @returns HSL color string with appropriate opacity
 */
export function getCompareColor(
  panelsContainingTrack: number,
  totalPanels: number
): string {
  if (totalPanels <= 1) {
    // No comparison possible with 0 or 1 panel
    return 'transparent';
  }

  // Calculate ratio: 0 = unique (in 1 panel), 1 = in all panels
  // We subtract 1 from both to normalize: if in 1 panel -> 0%, if in all panels -> 100%
  const ratio = (panelsContainingTrack - 1) / (totalPanels - 1);

  // Color interpolation: Red (0) -> Yellow (0.5) -> Green (1)
  // HSL: Red = 0°, Yellow = 60°, Green = 120°
  const hue = ratio * 120; // 0 to 120

  // Use consistent saturation and lightness for dark theme
  // Lower lightness for darker, more subtle colors
  const saturation = 70;
  const lightness = 35;
  const opacity = 0.4; // Subtle but visible background

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${opacity})`;
}

/**
 * Get a CSS class name hint for the compare color (for debugging/testing).
 */
export function getCompareColorClass(
  panelsContainingTrack: number,
  totalPanels: number
): 'compare-unique' | 'compare-some' | 'compare-all' | null {
  if (totalPanels <= 1) return null;
  
  if (panelsContainingTrack === 1) return 'compare-unique';
  if (panelsContainingTrack === totalPanels) return 'compare-all';
  return 'compare-some';
}

/**
 * Get compare color for a specific track.
 * Returns transparent if compare mode is disabled or track not found.
 */
export function getTrackCompareColor(
  trackUri: string,
  distribution: TrackDistribution | null,
  isCompareEnabled: boolean
): string {
  if (!isCompareEnabled || !distribution || distribution.totalPanels <= 1) {
    return 'transparent';
  }

  const panelsWithTrack = distribution.trackToPanels.get(trackUri);
  const count = panelsWithTrack?.size ?? 0;

  // Track not in any compared panel (e.g., from browse/recs)
  // Still color it based on 0 presence = red (unique/not in any playlist)
  if (count === 0) {
    return getCompareColor(1, distribution.totalPanels); // Treat as unique
  }

  return getCompareColor(count, distribution.totalPanels);
}
