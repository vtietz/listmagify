import type * as React from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { AlertTriangle, Loader2 } from 'lucide-react';
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
  showReleaseYearColumn: boolean;
  showPopularityColumn: boolean;
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
  onRemovePending?: (() => void) | undefined;
  onArtistClick: (e: React.MouseEvent, artistName: string, artistId?: string | null) => void;
  onAlbumClick: (e: React.MouseEvent, albumName: string, albumId?: string | null) => void;
  dragListeners: SyntheticListenerMap | undefined;
  pendingStatus?: 'matching' | 'unresolved' | undefined;
  pendingMessage?: string | undefined;
}

function PendingStatusIndicator({
  pendingStatus,
  pendingMessage,
  isCompact,
}: {
  pendingStatus?: 'matching' | 'unresolved' | undefined;
  pendingMessage?: string | undefined;
  isCompact: boolean;
}): React.ReactNode {
  if (!pendingStatus || pendingStatus === 'matching') {
    return null;
  }

  return (
    <span
      className="inline-flex items-center text-amber-500"
      title={pendingMessage ?? 'Match unresolved'}
    >
      <AlertTriangle className={cn(isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
    </span>
  );
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
  pendingStatus,
  isCompact,
}: {
  showStandardAddColumn: boolean;
  track: Track;
  playlistId: string | undefined;
  pendingStatus?: 'matching' | 'unresolved' | undefined;
  isCompact: boolean;
}): React.ReactNode {
  if (!showStandardAddColumn) {
    return null;
  }

  if (pendingStatus === 'matching') {
    return (
      <div className="flex items-center justify-center" style={{ width: isCompact ? 24 : 28 }}>
        <Loader2 className={cn('animate-spin text-muted-foreground', isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      </div>
    );
  }

  if (pendingStatus === 'unresolved') {
    return (
      <div className="flex items-center justify-center" style={{ width: isCompact ? 24 : 28 }}>
        <AlertTriangle className={cn('text-amber-500', isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      </div>
    );
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
  pendingStatus,
  onRemovePending,
}: {
  showHandle: boolean;
  isCompact: boolean;
  onMoreButtonClick: (e: React.MouseEvent) => void;
  pendingStatus?: 'matching' | 'unresolved' | undefined;
  onRemovePending?: (() => void) | undefined;
}): React.ReactNode {
  if (showHandle) {
    return undefined;
  }

  if (pendingStatus === 'matching' && onRemovePending) {
    return (
      <button
        className={cn(
          'shrink-0 flex items-center justify-center rounded',
          'opacity-100 bg-muted/80 hover:bg-muted transition-all',
          isCompact ? 'w-6 h-6' : 'w-7 h-7',
        )}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemovePending();
        }}
        aria-label="Remove pending item"
        title="Cancel pending operation"
      >
        <X className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
    );
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
  showReleaseYearColumn,
  showPopularityColumn,
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
  onRemovePending,
  onArtistClick,
  onAlbumClick,
  dragListeners,
  pendingStatus,
  pendingMessage,
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

      <AddToMarkedCell showStandardAddColumn={showStandardAddColumn} track={track} playlistId={playlistId} pendingStatus={pendingStatus} isCompact={isCompact} />

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
        statusIndicator={
          showStandardAddColumn
            ? null
            : PendingStatusIndicator({ pendingStatus, pendingMessage, isCompact })
        }
        moreButton={TitleMoreButton({
          showHandle,
          isCompact,
          onMoreButtonClick,
          pendingStatus,
          onRemovePending,
        })}
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

      {showReleaseYearColumn && (
        <DateCell isCompact={isCompact} track={track} scrobbleTimestamp={scrobbleTimestamp} />
      )}

      {showPopularityColumn && (
        <PopularityBar isCompact={isCompact} popularity={track.popularity} />
      )}
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
