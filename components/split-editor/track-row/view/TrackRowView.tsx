import type * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { AddToMarkedButton } from '../../playlist/AddToMarkedButton';
import { DragHandle } from '../../mobile/DragHandle';
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
import type { Track } from '@/lib/music-provider/types';
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

interface DragHandleCellProps {
  showHandle: boolean;
  locked: boolean;
  dragListeners: SyntheticListenerMap | undefined;
  isDragging: boolean;
  isCompact: boolean;
}

function DragHandleCell({
  showHandle,
  locked,
  dragListeners,
  isDragging,
  isCompact,
}: DragHandleCellProps): React.ReactNode {
  if (!showHandle) {
    return null;
  }

  return (
    <DragHandle
      disabled={locked}
      {...(dragListeners ? { listeners: dragListeners } : {})}
      isDragging={isDragging}
      isCompact={isCompact}
    />
  );
}

function ContributorCell({
  isCollaborative,
  isCompact,
  contributorProfile,
}: {
  isCollaborative: boolean;
  isCompact: boolean;
  contributorProfile: { userId: string; displayName: string | null; imageUrl: string | null } | null;
}): React.ReactNode {
  if (!isCollaborative) {
    return null;
  }

  return (
    <ContributorAvatar
      isCompact={isCompact}
      userId={contributorProfile?.userId}
      displayName={contributorProfile?.displayName}
      imageUrl={contributorProfile?.imageUrl}
    />
  );
}

function PlayButtonCell({
  shouldShowPlayButton,
  isCompact,
  isPlaying,
  isPlaybackLoading,
  isLocalFile,
  isPlayingFromThisPanel,
  onPlayClick,
}: {
  shouldShowPlayButton: boolean;
  isCompact: boolean;
  isPlaying: boolean;
  isPlaybackLoading: boolean;
  isLocalFile: boolean;
  isPlayingFromThisPanel: boolean;
  onPlayClick: (e: React.MouseEvent) => void;
}): React.ReactNode {
  if (!shouldShowPlayButton) {
    return null;
  }

  return (
    <PlayPauseButton
      isCompact={isCompact}
      isPlaying={isPlaying}
      isLoading={isPlaybackLoading}
      isLocalFile={isLocalFile}
      isPlayingFromThisPanel={isPlayingFromThisPanel}
      onClick={onPlayClick}
    />
  );
}

function AddToMarkedCell({
  showStandardAddColumn,
  track,
  playlistId,
}: {
  showStandardAddColumn: boolean;
  track: Track;
  playlistId: string | undefined;
}): React.ReactNode {
  if (!showStandardAddColumn) {
    return null;
  }

  return (
    <AddToMarkedButton
      trackUri={track.uri}
      trackName={track.name}
      trackArtists={track.artists}
      {...(playlistId ? { excludePlaylistId: playlistId } : {})}
    />
  );
}

function LikedColumnCell({
  showLikedColumn,
  isCompact,
  isLiked,
  isLocalFile,
  onHeartClick,
}: {
  showLikedColumn: boolean;
  isCompact: boolean;
  isLiked: boolean;
  isLocalFile: boolean;
  onHeartClick: (e: React.MouseEvent) => void;
}): React.ReactNode {
  if (!showLikedColumn) {
    return <div />;
  }

  return (
    <HeartButton
      isCompact={isCompact}
      isLiked={isLiked}
      isLocalFile={isLocalFile}
      onClick={onHeartClick}
    />
  );
}

function TitleMoreButton({
  showHandle,
  isCompact,
  onMoreButtonClick,
}: {
  showHandle: boolean;
  isCompact: boolean;
  onMoreButtonClick: (e: React.MouseEvent) => void;
}): React.ReactNode {
  if (showHandle) {
    return undefined;
  }

  return (
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
  );
}

function CumulativeTimeCellIfEnabled({
  showCumulativeTime,
  isCompact,
  cumulativeDurationMs,
}: {
  showCumulativeTime: boolean;
  isCompact: boolean;
  cumulativeDurationMs: number;
}): React.ReactNode {
  if (!showCumulativeTime) {
    return null;
  }

  return <CumulativeTimeCell isCompact={isCompact} cumulativeDurationMs={cumulativeDurationMs} />;
}

function HourBoundaryCell({
  crossesHourBoundary,
  isCompact,
  hourNumber,
}: {
  crossesHourBoundary: boolean;
  isCompact: boolean;
  hourNumber: number;
}): React.ReactNode {
  if (!crossesHourBoundary) {
    return null;
  }

  return <HourBoundaryMarker isCompact={isCompact} hourNumber={hourNumber} />;
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
      <DragHandleCell
        showHandle={showHandle}
        locked={locked}
        dragListeners={dragListeners}
        isDragging={isDragging}
        isCompact={isCompact}
      />

      {renderPrefixColumns?.()}

      <ContributorCell
        isCollaborative={isCollaborative}
        isCompact={isCompact}
        contributorProfile={contributorProfile}
      />

      <PlayButtonCell
        shouldShowPlayButton={shouldShowPlayButton}
        isCompact={isCompact}
        isPlaying={isPlaying}
        isPlaybackLoading={isPlaybackLoading}
        isLocalFile={isLocalFile}
        isPlayingFromThisPanel={isPlayingFromThisPanel}
        onPlayClick={onPlayClick}
      />

      <AddToMarkedCell showStandardAddColumn={showStandardAddColumn} track={track} playlistId={playlistId} />

      <LikedColumnCell
        showLikedColumn={showLikedColumn}
        isCompact={isCompact}
        isLiked={isLiked}
        isLocalFile={isLocalFile}
        onHeartClick={onHeartClick}
      />

      <PositionCell isCompact={isCompact} index={index} position={track.position} />

      <TitleCell
        isCompact={isCompact}
        track={track}
        isAutoScrollEnabled={isAutoScrollEnabled}
        moreButton={TitleMoreButton({ showHandle, isCompact, onMoreButtonClick })}
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

      <CumulativeTimeCellIfEnabled
        showCumulativeTime={showCumulativeTime}
        isCompact={isCompact}
        cumulativeDurationMs={cumulativeDurationMs}
      />

      <HourBoundaryCell
        crossesHourBoundary={crossesHourBoundary}
        isCompact={isCompact}
        hourNumber={hourNumber}
      />

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
