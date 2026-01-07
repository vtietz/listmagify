/**
 * Global store for track context menu state.
 * Ensures only one context menu is open at a time and centralizes menu data.
 */

import { create } from 'zustand';
import type { Track } from '@/lib/spotify/types';
import type { MarkerActions, TrackActions, ReorderActions, RecommendationActions } from '@/components/split-editor/TrackContextMenu';

interface ContextMenuState {
  /** Whether the context menu is open */
  isOpen: boolean;
  /** Position of the menu */
  position: { x: number; y: number } | null;
  /** The track the menu is for */
  track: Track | null;
  /** Whether to show multi-select mode */
  isMultiSelect: boolean;
  /** Number of selected tracks */
  selectedCount: number;
  /** Whether the playlist is editable */
  isEditable: boolean;
  /** Panel ID the menu was opened from */
  panelId: string | null;
  /** Marker actions */
  markerActions: MarkerActions | null;
  /** Track actions */
  trackActions: TrackActions | null;
  /** Reorder actions */
  reorderActions: ReorderActions | null;
  /** Recommendation actions */
  recActions: RecommendationActions | null;
}

interface ContextMenuActions {
  /** Open the context menu for a track */
  openMenu: (params: {
    track: Track;
    position: { x: number; y: number };
    isMultiSelect: boolean;
    selectedCount: number;
    isEditable: boolean;
    panelId: string;
    markerActions: MarkerActions;
    trackActions: TrackActions;
    reorderActions?: ReorderActions;
    recActions?: RecommendationActions;
  }) => void;
  /** Close the context menu */
  closeMenu: () => void;
}

const initialState: ContextMenuState = {
  isOpen: false,
  position: null,
  track: null,
  isMultiSelect: false,
  selectedCount: 1,
  isEditable: false,
  panelId: null,
  markerActions: null,
  trackActions: null,
  reorderActions: null,
  recActions: null,
};

export const useContextMenuStore = create<ContextMenuState & ContextMenuActions>((set) => ({
  ...initialState,

  openMenu: (params) => {
    set({
      isOpen: true,
      position: params.position,
      track: params.track,
      isMultiSelect: params.isMultiSelect,
      selectedCount: params.selectedCount,
      isEditable: params.isEditable,
      panelId: params.panelId,
      markerActions: params.markerActions,
      trackActions: params.trackActions,
      reorderActions: params.reorderActions ?? null,
      recActions: params.recActions ?? null,
    });
  },

  closeMenu: () => {
    set(initialState);
  },
}));
