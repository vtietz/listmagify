import type * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { AddToMarkedButton } from '../../AddToMarkedButton';
import { DragHandle } from '../../DragHandle';
import {
  PositionCell,
  TitleCell,
  ArtistCell,
  AlbumCell,
  DateCell,
  PopularityBar,
  DurationCell,
  CumulativeTimeCell,
  HourBoundaryMarker,
} from '../../TrackRowCells';
import {
  HeartButton,
  PlayPauseButton,
  ContributorAvatar,
} from '../../TrackRowActions';
import { cn } from '@/lib/utils';
import type { Track } from '@/lib/spotify/types';
import { InsertionControls } from './InsertionControls';

interface TrackRowViewProps {
  track: Track;
  index: number;
  isEditable: boolean;
  locked: boolean;
  showHandle: boolean;
  isDragging: boolean;
  isCompact: boolean;
  isCollaborative: boolean;
  shouldShowPlayButton: boolean;
  showStandardAddColumn: boolean;
  showLikedColumn: boolean;
  isLiked: boolean;
  isLocalFile: boolean;
  isPlaying: boolean;
  isPlaybackLoading: boolean;
  isPlayingFromThisPanel: boolean;
  isAutoScrollEnabled: boolean;
  renderPrefixColumns: (() => React.ReactNode) | undefined;
  contributorProfile: { userId: string; displayName: string | null; imageUrl: string | null } | null;
  scrobbleTimestamp: number | undefined;
  showCumulativeTime: boolean;
  cumulativeDurationMs: number;
  crossesHourBoundary: boolean;
  hourNumber: number;
  playlistId: string | undefined;
  hasInsertionMarker: boolean;
  hasInsertionMarkerAfter: boolean;
  allowInsertionMarkerToggle: boolean;
  nearEdge: 'top' | 'bottom' | null;
  onToggleInsertionMarker: (e: React.MouseEvent) => void;
  onHeartClick: (e: React.MouseEvent) => void;
  onPlayClick: (e: React.MouseEvent) => void;
  onMoreButtonClick: (e: React.MouseEvent) => void;
  onArtistClick: (e: React.MouseEvent, artistName: string) => void;
  onAlbumClick: (e: React.MouseEvent, albumName: string) => void;
  dragListeners: SyntheticListenerMap | undefined;
}

export function TrackRowView({
  track,
  index,
  isEditable,
  locked,
  showHandle,
  isDragging,
  isCompact,
  isCollaborative,
  shouldShowPlayButton,
  showStandardAddColumn,
  showLikedColumn,
  isLiked,
  isLocalFile,
  isPlaying,
  isPlaybackLoading,
  isPlayingFromThisPanel,
  isAutoScrollEnabled,
  renderPrefixColumns,
  contributorProfile,
  scrobbleTimestamp,
  showCumulativeTime,
  cumulativeDurationMs,
  crossesHourBoundary,
  hourNumber,
  playlistId,
  hasInsertionMarker,
  hasInsertionMarkerAfter,
  allowInsertionMarkerToggle,
  nearEdge,
  onToggleInsertionMarker,
  onHeartClick,
  onPlayClick,
  onMoreButtonClick,
  onArtistClick,
  onAlbumClick,
  dragListeners,
}: TrackRowViewProps) {
  return (
    <>
      {showHandle && (
        <DragHandle
          disabled={locked}
          {...(dragListeners ? { listeners: dragListeners } : {})}
          isDragging={isDragging}
          isCompact={isCompact}
        />
      )}

      {renderPrefixColumns?.()}

      {isCollaborative && (
        <ContributorAvatar
          isCompact={isCompact}
          userId={contributorProfile?.userId}
          displayName={contributorProfile?.displayName}
          imageUrl={contributorProfile?.imageUrl}
        />
      )}

      {shouldShowPlayButton && (
        <PlayPauseButton
          isCompact={isCompact}
          isPlaying={isPlaying}
          isLoading={isPlaybackLoading}
          isLocalFile={isLocalFile}
          isPlayingFromThisPanel={isPlayingFromThisPanel}
          onClick={onPlayClick}
        />
      )}

      {showStandardAddColumn && (
        <AddToMarkedButton
          trackUri={track.uri}
          trackName={track.name}
          trackArtists={track.artists}
          {...(playlistId ? { excludePlaylistId: playlistId } : {})}
        />
      )}

      {showLikedColumn ? (
        <HeartButton
          isCompact={isCompact}
          isLiked={isLiked}
          isLocalFile={isLocalFile}
          onClick={onHeartClick}
        />
      ) : (
        <div />
      )}

      <PositionCell isCompact={isCompact} index={index} position={track.position} />

      <TitleCell
        isCompact={isCompact}
        track={track}
        isAutoScrollEnabled={isAutoScrollEnabled}
        moreButton={!showHandle ? (
          <button
            className={cn(
              'shrink-0 flex items-center justify-center rounded',
              'opacity-0 group-hover/row:opacity-100 group-hover/title:opacity-100 focus:opacity-100',
              'bg-muted/80 hover:bg-muted transition-all',
              isCompact ? 'w-6 h-6' : 'w-7 h-7',
            )}
            onClick={onMoreButtonClick}
            aria-label="More options"
          >
            <MoreHorizontal className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        ) : undefined}
      />

      <ArtistCell
        isCompact={isCompact}
        track={track}
        onArtistClick={onArtistClick}
        isAutoScrollEnabled={isAutoScrollEnabled}
      />

      <AlbumCell
        isCompact={isCompact}
        track={track}
        onAlbumClick={onAlbumClick}
        isAutoScrollEnabled={isAutoScrollEnabled}
      />

      <DateCell isCompact={isCompact} track={track} scrobbleTimestamp={scrobbleTimestamp} />

      <PopularityBar isCompact={isCompact} popularity={track.popularity} />
      <DurationCell isCompact={isCompact} durationMs={track.durationMs} />

      {showCumulativeTime && (
        <CumulativeTimeCell isCompact={isCompact} cumulativeDurationMs={cumulativeDurationMs} />
      )}

      {crossesHourBoundary && <HourBoundaryMarker isCompact={isCompact} hourNumber={hourNumber} />}

      <InsertionControls
        hasInsertionMarker={hasInsertionMarker}
        hasInsertionMarkerAfter={hasInsertionMarkerAfter}
        isEditable={isEditable}
        locked={locked}
        allowInsertionMarkerToggle={allowInsertionMarkerToggle}
        nearEdge={nearEdge}
        isCompact={isCompact}
        index={index}
        onToggle={onToggleInsertionMarker}
      />
    </>
  );
}
