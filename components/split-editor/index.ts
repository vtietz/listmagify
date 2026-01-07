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
export { TrackRowCells, IndexCell, TitleCell, ArtistCell, AlbumCell, DateAddedCell, DurationCell, LikedIndicatorCell } from './TrackRowCells';
export { TrackRowActions, PlayButton, AddToMarkerButton, TrackContextMenu } from './TrackRowActions';
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

// Constants
export {
  TRACK_ROW_HEIGHT,
  TRACK_ROW_HEIGHT_COMPACT,
  TRACK_ROW_HEIGHT_NORMAL,
  TABLE_HEADER_HEIGHT,
  TABLE_HEADER_HEIGHT_COMPACT,
  TABLE_HEADER_HEIGHT_NORMAL,
  VIRTUALIZATION_OVERSCAN,
} from './constants';
