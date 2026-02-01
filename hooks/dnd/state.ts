/**
 * DnD State Management Store
 *
 * Centralized Zustand store for drag-and-drop state.
 * Replaces multiple useState calls in useDndOrchestrator.
 */

import { create } from 'zustand';
import type { Track } from '@/lib/spotify/types';
import type { EphemeralInsertion } from './types';

/**
 * Drag state interface
 */
interface DndState {
  // Active drag state
  activeTrack: Track | null;
  activeId: string | null;
  sourcePanelId: string | null;
  activePanelId: string | null;
  activeSelectionCount: number;
  activeDragTracks: Track[];
  
  // Drop position state
  computedDropPosition: number | null;
  dropIndicatorIndex: number | null;
  ephemeralInsertion: EphemeralInsertion | null;
  
  // Snapshot refs (for stable drag operations)
  selectedIndices: number[];
  orderedTracksSnapshot: Track[];
}

/**
 * Drag state actions
 */
interface DndActions {
  // Start drag
  startDrag: (params: {
    track: Track;
    id: string;
    sourcePanelId: string | null;
    selectionCount: number;
    dragTracks: Track[];
    selectedIndices: number[];
    orderedTracks: Track[];
  }) => void;
  
  // Update during drag
  updateDropPosition: (params: {
    activePanelId: string | null;
    computedDropPosition: number | null;
    dropIndicatorIndex: number | null;
    ephemeralInsertion: EphemeralInsertion | null;
  }) => void;
  
  // End/cancel drag
  endDrag: () => void;
  
  // Getters for computed values
  getFinalDropPosition: () => number | null;
  getSelectedIndices: () => number[];
  getOrderedTracksSnapshot: () => Track[];
}

type DndStore = DndState & DndActions;

/**
 * Create the drag-and-drop state store
 */
export const useDndStateStore = create<DndStore>((set, get) => ({
  // Initial state
  activeTrack: null,
  activeId: null,
  sourcePanelId: null,
  activePanelId: null,
  activeSelectionCount: 0,
  activeDragTracks: [],
  computedDropPosition: null,
  dropIndicatorIndex: null,
  ephemeralInsertion: null,
  selectedIndices: [],
  orderedTracksSnapshot: [],

  // Actions
  startDrag: (params) => {
    set({
      activeTrack: params.track,
      activeId: params.id,
      sourcePanelId: params.sourcePanelId,
      activeSelectionCount: params.selectionCount,
      activeDragTracks: params.dragTracks,
      selectedIndices: params.selectedIndices,
      orderedTracksSnapshot: params.orderedTracks,
      // Clear drop state
      activePanelId: null,
      computedDropPosition: null,
      dropIndicatorIndex: null,
      ephemeralInsertion: null,
    });
  },

  updateDropPosition: (params) => {
    set({
      activePanelId: params.activePanelId,
      computedDropPosition: params.computedDropPosition,
      dropIndicatorIndex: params.dropIndicatorIndex,
      ephemeralInsertion: params.ephemeralInsertion,
    });
  },

  endDrag: () => {
    set({
      activeTrack: null,
      activeId: null,
      sourcePanelId: null,
      activePanelId: null,
      activeSelectionCount: 0,
      activeDragTracks: [],
      computedDropPosition: null,
      dropIndicatorIndex: null,
      ephemeralInsertion: null,
      // Don't clear snapshots here - they might be needed for drop operation
    });
  },

  // Getters
  getFinalDropPosition: () => get().computedDropPosition,
  getSelectedIndices: () => get().selectedIndices,
  getOrderedTracksSnapshot: () => get().orderedTracksSnapshot,
}));
