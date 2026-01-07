/**
 * Extracted cell subcomponents for TrackRow.
 * Each cell renders a specific column in the track grid.
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatDuration, formatReleaseDate, formatScrobbleDate } from '@/lib/utils/format';
import type { Track } from '@/lib/spotify/types';

// ============================================================================
// Common Types
// ============================================================================

interface CellProps {
  isCompact: boolean;
}

// ============================================================================
// Position Cell
// ============================================================================

interface PositionCellProps extends CellProps {
  /** Visual index in the list */
  index: number;
  /** Actual position in playlist (may differ from visual index when sorted/filtered) */
  position?: number | null | undefined;
}

export function PositionCell({ isCompact, index, position }: PositionCellProps) {
  return (
    <div className={cn('text-muted-foreground tabular-nums select-none', isCompact ? 'text-xs' : 'text-sm')}>
      {position != null ? position + 1 : index + 1}
    </div>
  );
}

// ============================================================================
// Title Cell
// ============================================================================

interface TitleCellProps extends CellProps {
  track: Track;
  /** Optional slot for the more button */
  moreButton?: React.ReactNode;
}

export function TitleCell({ isCompact, track, moreButton }: TitleCellProps) {
  return (
    <div className="min-w-0 relative flex items-center gap-1.5 group/title">
      {/* Explicit content badge per Spotify guidelines */}
      {track.explicit && (
        <span 
          className={cn(
            'shrink-0 inline-flex items-center justify-center rounded font-bold bg-muted-foreground/20 text-muted-foreground',
            isCompact ? 'text-[8px] px-1 h-3' : 'text-[9px] px-1.5 h-4'
          )}
          title="Explicit content"
          aria-label="Explicit"
        >
          E
        </span>
      )}
      <span 
        className={cn('truncate select-none', isCompact ? 'text-xs pr-6' : 'text-sm pr-7')}
        title={track.name}
      >
        {track.name}
      </span>
      {/* More button - absolutely positioned to allow text underneath */}
      {moreButton && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          {moreButton}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Artist Cell
// ============================================================================

interface ArtistCellProps extends CellProps {
  track: Track;
  /** Handler for clicking on an artist name to search */
  onArtistClick?: (e: React.MouseEvent, artistName: string) => void;
}

export function ArtistCell({ isCompact, track, onArtistClick }: ArtistCellProps) {
  return (
    <div className="min-w-0">
      <div className={cn('text-muted-foreground truncate', isCompact ? 'text-xs' : 'text-sm')}>
        {track.artistObjects && track.artistObjects.length > 0 ? (
          track.artistObjects.map((artist, idx) => (
            <span key={artist.id || artist.name}>
              <button
                className="hover:underline hover:text-green-500 text-left cursor-pointer"
                onClick={(e) => onArtistClick?.(e, artist.name)}
                title={`Search for tracks by "${artist.name}"`}
              >
                {artist.name}
              </button>
              {idx < track.artistObjects!.length - 1 && ', '}
            </span>
          ))
        ) : (
          track.artists.map((artistName, idx) => (
            <span key={artistName}>
              <button
                className="hover:underline hover:text-green-500 text-left cursor-pointer"
                onClick={(e) => onArtistClick?.(e, artistName)}
                title={`Search for tracks by "${artistName}"`}
              >
                {artistName}
              </button>
              {idx < track.artists.length - 1 && ', '}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Album Cell
// ============================================================================

interface AlbumCellProps extends CellProps {
  track: Track;
  /** Handler for clicking on an album name to search */
  onAlbumClick?: (e: React.MouseEvent, albumName: string) => void;
}

export function AlbumCell({ isCompact, track, onAlbumClick }: AlbumCellProps) {
  return (
    <div className="hidden lg:block min-w-0">
      {track.album?.name && (
        <div className={cn('text-muted-foreground truncate', isCompact ? 'text-xs' : 'text-sm')}>
          <button
            className="hover:underline hover:text-green-500 text-left cursor-pointer truncate max-w-full"
            onClick={(e) => onAlbumClick?.(e, track.album!.name as string)}
            title={`Search for tracks from "${track.album.name}"`}
          >
            {track.album.name}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Date Cell (Release Year or Scrobble Date)
// ============================================================================

interface DateCellProps extends CellProps {
  track: Track;
  /** Unix timestamp (seconds) of when track was scrobbled/played */
  scrobbleTimestamp?: number | undefined;
}

export function DateCell({ isCompact, track, scrobbleTimestamp }: DateCellProps) {
  if (scrobbleTimestamp) {
    return (
      <div 
        className={cn('text-muted-foreground tabular-nums text-center select-none whitespace-nowrap', isCompact ? 'text-xs' : 'text-sm')}
        title={`Scrobbled: ${new Date(scrobbleTimestamp * 1000).toLocaleString()}`}
      >
        {formatScrobbleDate(scrobbleTimestamp)}
      </div>
    );
  }

  return (
    <div 
      className={cn('text-muted-foreground tabular-nums text-center select-none', isCompact ? 'text-xs' : 'text-sm')}
      title={track.album?.releaseDate ? `Released: ${formatReleaseDate(track.album.releaseDate, track.album.releaseDatePrecision)}` : 'Release date unknown'}
    >
      {track.album?.releaseDate ? track.album.releaseDate.substring(0, 4) : '—'}
    </div>
  );
}

// ============================================================================
// Popularity Bar
// ============================================================================

interface PopularityBarProps extends CellProps {
  popularity?: number | null | undefined;
}

export function PopularityBar({ isCompact, popularity }: PopularityBarProps) {
  return (
    <div 
      className="flex items-center justify-center select-none"
      title={popularity != null ? `Popularity: ${popularity}%` : 'Popularity: Unknown'}
    >
      {popularity != null ? (
        <div className={cn('w-full rounded-full bg-muted/50', isCompact ? 'h-1' : 'h-1.5')}>
          <div 
            className="h-full rounded-full transition-all"
            style={{ 
              width: `${popularity}%`,
              backgroundColor: `color-mix(in srgb, #11B7AE ${popularity}%, #6b7280)`
            }}
          />
        </div>
      ) : (
        <div className={cn('w-full rounded-full bg-muted/30', isCompact ? 'h-1' : 'h-1.5')} />
      )}
    </div>
  );
}

// ============================================================================
// Duration Cell
// ============================================================================

interface DurationCellProps extends CellProps {
  durationMs: number;
}

export function DurationCell({ isCompact, durationMs }: DurationCellProps) {
  return (
    <div className={cn('text-muted-foreground tabular-nums text-right select-none', isCompact ? 'text-xs' : 'text-sm')}>
      {formatDuration(durationMs)}
    </div>
  );
}

// ============================================================================
// Cumulative Time Cell
// ============================================================================

interface CumulativeTimeCellProps extends CellProps {
  cumulativeDurationMs: number;
}

export function CumulativeTimeCell({ isCompact, cumulativeDurationMs }: CumulativeTimeCellProps) {
  return (
    <div 
      className={cn('text-muted-foreground/60 tabular-nums text-right select-none', isCompact ? 'text-xs' : 'text-sm')}
      title={`Total time elapsed: ${formatDuration(cumulativeDurationMs)}`}
    >
      {formatDuration(cumulativeDurationMs)}
    </div>
  );
}

// ============================================================================
// Hour Boundary Marker
// ============================================================================

interface HourBoundaryMarkerProps extends CellProps {
  hourNumber: number;
}

export function HourBoundaryMarker({ isCompact, hourNumber }: HourBoundaryMarkerProps) {
  return (
    <div
      className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
      style={{ bottom: '-7px' }}
    >
      <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/70 to-cyan-500/70" />
      <span 
        className={cn(
          'px-1.5 text-cyan-500 font-medium whitespace-nowrap',
          isCompact ? 'text-[9px]' : 'text-[10px]'
        )}
        style={{ transform: 'translateY(-25%)' }}
      >
        {hourNumber}h
      </span>
      <div className="w-2 h-[1px] bg-cyan-500/70" />
    </div>
  );
}

// ============================================================================
// Insertion Marker Line
// ============================================================================

interface InsertionMarkerLineProps {
  position: 'top' | 'bottom';
}

export function InsertionMarkerLine({ position }: InsertionMarkerLineProps) {
  const style = position === 'top' 
    ? { top: '-1.5px', boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)' }
    : { bottom: '-1.5px', boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)' };
    
  return (
    <div
      className="absolute left-0 right-0 h-[3px] bg-orange-500 pointer-events-none z-10"
      style={style}
    />
  );
}
