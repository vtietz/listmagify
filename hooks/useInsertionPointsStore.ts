/**
 * Global state for insertion point markers.
 * Users can mark multiple insertion points within playlists.
 * When adding tracks, they are inserted at all marked positions.
 */

import { create } from 'zustand';

/** A single insertion point marker */
export interface InsertionPoint {
  /** Unique marker ID */
  markerId: string;
  /** 0-based index where tracks will be inserted (insert-before semantics) */
  index: number;
  /** When the marker was created */
  createdAt: number;
}

/** State for a single playlist's markers */
interface PlaylistMarkers {
  markers: InsertionPoint[];
}

interface InsertionPointsState {
  /** Map of playlistId to markers (sorted ascending by index) */
  playlists: Record<string, PlaylistMarkers>;
  
  /** Mark an insertion point (idempotent - no duplicates for same index) */
  markPoint: (playlistId: string, index: number) => void;
  
  /** Remove an insertion point at the given index */
  unmarkPoint: (playlistId: string, index: number) => void;
  
  /** Toggle an insertion point at the given index */
  togglePoint: (playlistId: string, index: number) => void;
  
  /** Clear all markers for a specific playlist */
  clearPlaylist: (playlistId: string) => void;
  
  /** Clear all markers across all playlists */
  clearAll: () => void;
  
  /** Get all markers for a playlist (sorted by index ascending) */
  getMarkers: (playlistId: string) => InsertionPoint[];
  
  /** Check if there are any active markers across all playlists */
  hasActiveMarkers: () => boolean;
  
  /** Check if a specific index in a playlist has a marker */
  hasMarkerAt: (playlistId: string, index: number) => boolean;
  
  /** Adjust marker indices when tracks are inserted/removed above them */
  adjustIndices: (playlistId: string, changeIndex: number, delta: number) => void;
  
  /** Increment all marker indices at or after a given index (after insertion) */
  incrementIndicesFrom: (playlistId: string, fromIndex: number, count: number) => void;
  
  /** Shift all markers after multi-point insertion: marker[i] shifts by (i+1) */
  shiftAfterMultiInsert: (playlistId: string) => void;
}

/** Stable empty array to avoid creating new references */
const EMPTY_MARKERS: InsertionPoint[] = [];

/** Generate a unique marker ID */
function generateMarkerId(): string {
  return `marker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useInsertionPointsStore = create<InsertionPointsState>()((set, get) => ({
  playlists: {},

  markPoint: (playlistId, index) => {
    set((state) => {
      const playlist = state.playlists[playlistId] || { markers: [] };
      
      // Check if marker already exists at this index
      if (playlist.markers.some(m => m.index === index)) {
        return state; // Idempotent - don't add duplicate
      }
      
      const newMarker: InsertionPoint = {
        markerId: generateMarkerId(),
        index,
        createdAt: Date.now(),
      };
      
      // Insert and keep sorted by index
      const newMarkers = [...playlist.markers, newMarker].sort((a, b) => a.index - b.index);
      
      return {
        playlists: {
          ...state.playlists,
          [playlistId]: { markers: newMarkers },
        },
      };
    });
  },

  unmarkPoint: (playlistId, index) => {
    set((state) => {
      const playlist = state.playlists[playlistId];
      if (!playlist) return state;
      
      const newMarkers = playlist.markers.filter(m => m.index !== index);
      
      // Clean up empty playlist entries
      if (newMarkers.length === 0) {
        const { [playlistId]: _, ...rest } = state.playlists;
        return { playlists: rest };
      }
      
      return {
        playlists: {
          ...state.playlists,
          [playlistId]: { markers: newMarkers },
        },
      };
    });
  },

  togglePoint: (playlistId, index) => {
    const state = get();
    const playlist = state.playlists[playlistId];
    const hasMarker = playlist?.markers.some(m => m.index === index);
    
    if (hasMarker) {
      state.unmarkPoint(playlistId, index);
    } else {
      state.markPoint(playlistId, index);
    }
  },

  clearPlaylist: (playlistId) => {
    set((state) => {
      const { [playlistId]: _, ...rest } = state.playlists;
      return { playlists: rest };
    });
  },

  clearAll: () => {
    set({ playlists: {} });
  },

  getMarkers: (playlistId) => {
    const state = get();
    return state.playlists[playlistId]?.markers ?? EMPTY_MARKERS;
  },

  hasActiveMarkers: () => {
    const state = get();
    return Object.values(state.playlists).some(p => p.markers.length > 0);
  },

  hasMarkerAt: (playlistId, index) => {
    const state = get();
    return state.playlists[playlistId]?.markers.some(m => m.index === index) || false;
  },

  adjustIndices: (playlistId, changeIndex, delta) => {
    set((state) => {
      const playlist = state.playlists[playlistId];
      if (!playlist) return state;
      
      const newMarkers = playlist.markers
        .map(m => {
          if (m.index >= changeIndex) {
            const newIndex = m.index + delta;
            // Remove markers that would go negative
            if (newIndex < 0) return null;
            return { ...m, index: newIndex };
          }
          return m;
        })
        .filter((m): m is InsertionPoint => m !== null)
        .sort((a, b) => a.index - b.index);
      
      if (newMarkers.length === 0) {
        const { [playlistId]: _, ...rest } = state.playlists;
        return { playlists: rest };
      }
      
      return {
        playlists: {
          ...state.playlists,
          [playlistId]: { markers: newMarkers },
        },
      };
    });
  },

  incrementIndicesFrom: (playlistId, fromIndex, count) => {
    set((state) => {
      const playlist = state.playlists[playlistId];
      if (!playlist) return state;
      
      const newMarkers = playlist.markers
        .map(m => {
          if (m.index >= fromIndex) {
            return { ...m, index: m.index + count };
          }
          return m;
        })
        .sort((a, b) => a.index - b.index);
      
      return {
        playlists: {
          ...state.playlists,
          [playlistId]: { markers: newMarkers },
        },
      };
    });
  },

  shiftAfterMultiInsert: (playlistId) => {
    set((state) => {
      const playlist = state.playlists[playlistId];
      if (!playlist || playlist.markers.length === 0) return state;
      
      // After inserting one track at each marker position (in order from lowest to highest),
      // each marker needs to shift based on how many insertions happened at or before it.
      // Marker at index i in the sorted array shifts by (i + 1):
      // - marker[0] shifts by 1 (only the insertion at its position)
      // - marker[1] shifts by 2 (insertion at marker[0] + insertion at its position)
      // - marker[n] shifts by (n + 1)
      const newMarkers = playlist.markers.map((m, i) => ({
        ...m,
        index: m.index + (i + 1),
      }));
      
      return {
        playlists: {
          ...state.playlists,
          [playlistId]: { markers: newMarkers },
        },
      };
    });
  },
}));

/**
 * Execute insertion of tracks at all marked points for a playlist.
 * Returns the list of indices where tracks should be inserted (adjusted for cumulative inserts).
 * 
 * @param markers - The markers for a playlist (sorted ascending by index)
 * @param trackCount - Number of tracks being inserted at each point
 * @returns Array of { originalIndex, effectiveIndex } for each marker
 */
export function computeInsertionPositions(
  markers: InsertionPoint[],
  trackCount: number
): { markerId: string; originalIndex: number; effectiveIndex: number }[] {
  let cumulativeInserts = 0;
  
  return markers.map((marker) => {
    const effectiveIndex = marker.index + cumulativeInserts;
    cumulativeInserts += trackCount;
    return {
      markerId: marker.markerId,
      originalIndex: marker.index,
      effectiveIndex,
    };
  });
}
