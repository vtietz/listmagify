import type { Track } from '@/lib/spotify/types';

// Action group types
export interface ReorderActions {
  onMoveUp?: (() => void) | undefined;
  onMoveDown?: (() => void) | undefined;
  onMoveToTop?: (() => void) | undefined;
  onMoveToBottom?: (() => void) | undefined;
  onPlaceBeforeMarker?: (() => void) | undefined;
  onPlaceAfterMarker?: (() => void) | undefined;
}

export interface MarkerActions {
  onAddMarkerBefore?: () => void;
  onAddMarkerAfter?: () => void;
  onRemoveMarker?: () => void;
  onAddToAllMarkers?: () => void;
  hasMarkerBefore?: boolean;
  hasMarkerAfter?: boolean;
  hasAnyMarkers?: boolean;
}

export interface TrackActions {
  onAddToPlaylist?: () => void;
  onRemoveFromPlaylist?: () => void;
  onToggleLiked?: () => void;
  /** For multi-select: explicitly like all selected tracks */
  onLikeAll?: () => void;
  /** For multi-select: explicitly unlike all selected tracks */
  onUnlikeAll?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onGoToArtist?: () => void;
  onGoToAlbum?: () => void;
  onOpenInSpotify?: () => void;
  /** Clear current selection */
  onClearSelection?: () => void;
  /** Delete all duplicates of this specific track (keeps the selected one) */
  onDeleteTrackDuplicates?: () => void;
  isPlaying?: boolean;
  isLiked?: boolean;
  canRemove?: boolean;
}

export interface RecommendationActions {
  onShowSimilar?: () => void;
  onOpenBrowse?: () => void;
}

export interface TrackContextMenuProps {
  /** The track this menu is for */
  track: Track;
  /** Whether the menu is open */
  isOpen: boolean;
  /** Callback to close the menu */
  onClose: () => void;
  /** Position for popover (tablet) */
  position?: { x: number; y: number };
  /** Reorder action handlers */
  reorderActions?: ReorderActions;
  /** Marker action handlers */
  markerActions?: MarkerActions;
  /** Track action handlers */
  trackActions?: TrackActions;
  /** Recommendation action handlers */
  recActions?: RecommendationActions;
  /** Whether multiple tracks are selected */
  isMultiSelect?: boolean;
  /** Number of selected tracks */
  selectedCount?: number;
  /** Whether the playlist is editable */
  isEditable?: boolean;
}

// Shared props for menu content components
export interface MenuContentProps {
  title: string;
  withClose: (action?: () => void) => () => void;
  reorderActions: ReorderActions | undefined;
  markerActions: MarkerActions | undefined;
  trackActions: TrackActions | undefined;
  recActions: RecommendationActions | undefined;
  isMultiSelect: boolean;
  selectedCount: number;
  isEditable: boolean;
}
