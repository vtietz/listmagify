/**
 * Split Editor Feature Components
 * 
 * This module exports all components related to the split-panel playlist editor.
 * Import from '@/components/split-editor' for cleaner imports.
 */

// Main grid and layout components
export { SplitGrid } from './layout/SplitGrid';
export { SplitNodeView } from './layout/SplitNodeView';
export { SinglePlaylistView } from './layout/SinglePlaylistView';

// Playlist panel components
export { PlaylistPanel } from './playlist/PlaylistPanel';
export { PlaylistSelector } from './playlist/PlaylistSelector';
export { PanelToolbar } from './playlist/PanelToolbar';

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
export { TableHeader, TRACK_GRID_CLASSES, TRACK_GRID_CLASSES_NORMAL, TRACK_GRID_CLASSES_COMPACT, getTrackGridStyle } from '@features/split-editor/playlist/ui/TableHeader';
export { VirtualizedTrackListContainer } from './VirtualizedTrackListContainer';

// Browse panel components
export { BrowsePanel, BROWSE_PANEL_ID } from './browse/BrowsePanel';
export { SearchPanel, SEARCH_PANEL_ID } from './browse/SearchPanel';
export { RecommendationsPanel } from './browse/RecommendationsPanel';
export { LastfmBrowseTab, LASTFM_PANEL_ID } from './browse/LastfmBrowseTab';

// Marker and indicator components
export { DropIndicator } from '@features/dnd/ui/DropIndicator';
export { InsertionMarkersOverlay, InsertionMarker } from './InsertionMarker';

// Action button components
export { AddToMarkedButton } from './playlist/AddToMarkedButton';
export { AddSelectedToMarkersButton } from './playlist/AddSelectedToMarkersButton';
export { LastfmAddToMarkedButton } from './browse/LastfmAddToMarkedButton';

// Mobile-specific components
export { DragHandle, useDragHandle } from './mobile/DragHandle';
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
