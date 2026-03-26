import type * as React from 'react';
import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId, SearchFilterType } from '@/lib/music-provider/types';
import { type MobileOverlay } from '../mobile/MobileBottomNav';
import { useContextMenuStore } from '@/hooks/useContextMenuStore';
import {
  type ReorderActions,
  type MarkerActions,
  type TrackActions,
  type PendingActions,
} from '../TrackContextMenu';

export interface TrackRowProps {
  track: Track;
  index: number;
  selectionKey: string;
  isSelected: boolean;
  isEditable: boolean;
  locked?: boolean;
  onSelect: (selectionKey: string, index: number, event: React.MouseEvent) => void;
  onClick: (selectionKey: string, index: number) => void;
  panelId?: string;
  playlistId?: string;
  dndMode?: 'copy' | 'move';
  isDragSourceSelected?: boolean;
  showLikedColumn?: boolean;
  isLiked?: boolean;
  onToggleLiked?: (trackId: string, currentlyLiked: boolean) => void;
  isPlaying?: boolean;
  isPlaybackLoading?: boolean;
  onPlay?: (trackUri: string) => void;
  onPause?: () => void;
  isPlayingFromThisPanel?: boolean;
  hasInsertionMarker?: boolean;
  hasInsertionMarkerAfter?: boolean;
  isCollaborative?: boolean;
  getProfile?: ((userId: string) => { displayName?: string | null; imageUrl?: string | null } | undefined) | undefined;
  cumulativeDurationMs?: number;
  crossesHourBoundary?: boolean;
  hourNumber?: number;
  allowInsertionMarkerToggle?: boolean;
  renderPrefixColumns?: () => React.ReactNode;
  showMatchStatusColumn?: boolean;
  showCustomAddColumn?: boolean;
  scrobbleTimestamp?: number | undefined;
  showScrobbleDateColumn?: boolean;
  showReleaseYearColumn?: boolean;
  showPopularityColumn?: boolean;
  showCumulativeTime?: boolean;
  dragType?: 'track' | 'lastfm-track';
  matchedTrack?: { id: string; uri: string; name: string; artist?: string | undefined; durationMs?: number | undefined } | null;
  lastfmDto?: { artistName: string; trackName: string; albumName?: string | undefined };
  selectedMatchedUris?: string[];
  onDragStart?: () => void;
  isDuplicate?: boolean;
  isSoftDuplicate?: boolean;
  isOtherInstanceSelected?: boolean;
  compareColor?: string | undefined;
  reorderActions?: ReorderActions;
  markerActions?: MarkerActions;
  contextTrackActions?: TrackActions;
  isMultiSelect?: boolean;
  selectedCount?: number;
  selectedTracks?: Track[] | undefined;
  pendingStatus?: 'matching' | 'unresolved' | undefined;
  pendingMessage?: string | undefined;
  onRemovePending?: (() => void) | undefined;
  pendingActions?: PendingActions | undefined;
}

export interface TrackRowSharedContext {
  isCompact: boolean;
  isAutoScrollEnabled: boolean;
  openBrowsePanel: (providerId?: MusicProviderId) => void;
  providerId: MusicProviderId;
  setSearchQuery: (q: string) => void;
  setSearchFilter: (filter: SearchFilterType) => void;
  togglePoint: (playlistId: string, position: number) => void;
  hasAnyMarkersGlobal: boolean;
  isPhone: boolean;
  setMobileOverlay: (overlay: MobileOverlay) => void;
  isDndActive: boolean;
  openContextMenu: ReturnType<typeof useContextMenuStore.getState>['openMenu'];
  showHandle: boolean;
  handleOnlyDrag: boolean;
}

export type TrackRowInnerProps = TrackRowProps & { ctx: TrackRowSharedContext };
