/**
 * Split Editor Feature Components
 * 
 * This module exports all components related to the split-panel playlist editor.
 * Import from '@/components/split-editor' for cleaner imports.
 */

// Main grid and layout components
export { SplitGrid } from './SplitGrid';
export { SplitNodeView } from './SplitNodeView';
export { SinglePlaylistView } from './SinglePlaylistView';

// Playlist panel components
export { PlaylistPanel } from './PlaylistPanel';
export { PlaylistSelector } from './PlaylistSelector';
export { PanelToolbar } from './PanelToolbar';

// Track list components
export { TrackRow } from './TrackRow';
export { 
  PositionCell, 
  TitleCell, 
  ArtistCell, 
  AlbumCell, 
  DateCell,
  PopularityBar,
  DurationCell, 
  CumulativeTimeCell,
  HourBoundaryMarker,
  InsertionMarkerLine,
} from './TrackRowCells';
export { 
  HeartButton, 
  PlayPauseButton, 
  InsertionToggleButton, 
  ContributorAvatar,
} from './TrackRowActions';
export { TableHeader, TRACK_GRID_CLASSES, TRACK_GRID_CLASSES_NORMAL, TRACK_GRID_CLASSES_COMPACT, getTrackGridStyle } from './TableHeader';
export { VirtualizedTrackListContainer } from './VirtualizedTrackListContainer';

// Browse panel components
export { BrowsePanel, BROWSE_PANEL_ID } from './BrowsePanel';
export { SearchPanel, SEARCH_PANEL_ID } from './SearchPanel';
export { RecommendationsPanel } from './RecommendationsPanel';
export { LastfmBrowseTab, LASTFM_PANEL_ID } from './LastfmBrowseTab';

// Marker and indicator components
export { DropIndicator } from './DropIndicator';
export { InsertionMarkersOverlay, InsertionMarker } from './InsertionMarker';
export { MatchStatusIndicator } from './MatchStatusIndicator';

// Action button components
export { AddToMarkedButton } from './AddToMarkedButton';
export { AddSelectedToMarkersButton } from './AddSelectedToMarkersButton';
export { LastfmAddToMarkedButton } from './LastfmAddToMarkedButton';

// Mobile-specific components
export { DragHandle, useDragHandle } from './DragHandle';
export { MobilePanelSwitcher, useMobilePanelSwitcher } from './MobilePanelSwitcher';
export { MobileBrowseOverlay, useMobileBrowseOverlay, QuickAddButton } from './MobileBrowseOverlay';
export { 
  TrackContextMenu as MobileTrackContextMenu, 
  ContextMenuTrigger, 
  useTrackContextMenu,
  type ReorderActions,
  type MarkerActions,
  type TrackActions,
  type RecommendationActions,
} from './TrackContextMenu';

// Constants
export {
  TRACK_ROW_HEIGHT,
  TRACK_ROW_HEIGHT_COMPACT,
  TABLE_HEADER_HEIGHT,
  TABLE_HEADER_HEIGHT_COMPACT,
  VIRTUALIZATION_OVERSCAN,
} from './constants';
