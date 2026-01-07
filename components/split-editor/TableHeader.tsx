/**
 * TableHeader component for playlist tables with sortable columns.
 * Sticky header that remains visible during scroll.
 */

'use client';

import { ArrowUp, ArrowDown, Heart, Play, Plus, TrendingUp, Calendar, Users, Timer, Radio, GripVertical } from 'lucide-react';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { usePlayerStore } from '@/hooks/usePlayerStore';
import { useDragHandle } from './DragHandle';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

interface TableHeaderProps {
  isEditable: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  /** Whether to show the liked status column */
  showLikedColumn?: boolean;
  /** Whether this is a collaborative playlist (shows added-by column) */
  isCollaborative?: boolean;
  /** Whether to show the match status column (for Last.fm import) */
  showMatchStatusColumn?: boolean;
  /** Whether to show the custom add column (for Last.fm import) */
  showCustomAddColumn?: boolean;
  /** Whether to show wider date column for scrobble timestamps */
  showScrobbleDateColumn?: boolean;
  /** Whether to show cumulative time column (default true) */
  showCumulativeTime?: boolean;
}

/** Grid template for consistent column alignment between header and rows */
export const TRACK_GRID_CLASSES = 'grid items-center';
export const TRACK_GRID_CLASSES_NORMAL = 'gap-2 px-2';
export const TRACK_GRID_CLASSES_COMPACT = 'gap-1 px-1';

export interface TrackGridOptions {
  showPlayColumn?: boolean;
  showAddToMarkedColumn?: boolean;
  showContributorColumn?: boolean;
  /** Show match status indicator column (for Last.fm import) */
  showMatchStatusColumn?: boolean;
  /** Show custom add button column (for Last.fm import - replaces standard add to marked) */
  showCustomAddColumn?: boolean;
  /** Show wider date column for scrobble timestamps instead of year */
  showScrobbleDateColumn?: boolean;
  /** Show cumulative time column (default true) */
  showCumulativeTime?: boolean;
  /** Show drag handle column (for touch devices) */
  showDragHandle?: boolean;
}

/**
 * Generates dynamic grid template columns based on which columns are visible.
 * 
 * @param showPlayColumn - Whether to show play button column
 * @param showAddToMarkedColumn - Whether to show add-to-marked button column
 * @param showContributorColumn - Whether to show contributor avatar column
 * @param options - Additional column options
 * @param _isMobile - Whether to use simplified mobile layout (fewer columns)
 */
export function getTrackGridStyle(
  showPlayColumn: boolean,
  showAddToMarkedColumn: boolean,
  showContributorColumn: boolean = false,
  options?: Pick<TrackGridOptions, 'showMatchStatusColumn' | 'showCustomAddColumn' | 'showScrobbleDateColumn' | 'showCumulativeTime' | 'showDragHandle'>,
  _isMobile: boolean = false // Unused - always use same layout
) {
  // Build columns array dynamically - same layout for all devices
  const columns: string[] = [];
  
  // Drag handle column - first column on touch devices (44px touch target)
  if (options?.showDragHandle) columns.push('44px');
  
  // Prefix columns (before standard track columns)
  if (options?.showMatchStatusColumn) columns.push('20px'); // Match status indicator
  if (options?.showCustomAddColumn) columns.push('20px');   // Custom add button (e.g., Last.fm)
  
  if (showContributorColumn) columns.push('20px'); // Contributor avatar
  if (showPlayColumn) columns.push('20px');        // Play button
  if (showAddToMarkedColumn) columns.push('20px'); // Add to marked button
  columns.push('20px');                            // Heart (liked)
  columns.push('28px');                            // Position #
  columns.push('minmax(80px, 2fr)');               // Title
  columns.push('minmax(60px, 1fr)');               // Artist
  columns.push('minmax(60px, 1fr)');               // Album
  // Date column: wider for scrobble dates (e.g., "3 Jan, 10:24"), narrow for just year
  columns.push(options?.showScrobbleDateColumn ? '90px' : '36px');
  columns.push('36px');                            // Popularity
  columns.push('44px');                            // Time
  // Cumulative time column (default: show)
  if (options?.showCumulativeTime !== false) {
    columns.push('52px');                          // Cumulative time
  }
  
  return { gridTemplateColumns: columns.join(' ') };
}

// Legacy exports for compatibility
export const TRACK_GRID_STYLE = {
  gridTemplateColumns: '20px 20px 20px 28px minmax(80px, 2fr) minmax(60px, 1fr) 36px 36px 44px',
};
export const TRACK_GRID_STYLE_WITH_ALBUM = {
  gridTemplateColumns: '20px 20px 20px 28px minmax(80px, 2fr) minmax(60px, 1fr) minmax(60px, 1fr) 36px 36px 44px',
};

export function TableHeader({ 
  isEditable, 
  sortKey, 
  sortDirection, 
  onSort, 
  showLikedColumn = true, 
  isCollaborative = false,
  showMatchStatusColumn = false,
  showCustomAddColumn = false,
  showScrobbleDateColumn = false,
  showCumulativeTime = true,
}: TableHeaderProps) {
  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;
  const { isCompact } = useCompactModeStore();
  
  // Get visibility states from stores
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const hasAnyMarkers = Object.values(playlists).some((p) => p.markers.length > 0);
  
  // Mobile drag handle visibility (matches TrackRow)
  const { showHandle: showDragHandle } = useDragHandle();
  
  // Don't show standard add column if using custom add column
  const showStandardAddColumn = hasAnyMarkers && !showCustomAddColumn;
  
  // Dynamic grid style based on visible columns
  const gridStyle = getTrackGridStyle(
    isPlayerVisible, 
    showStandardAddColumn, 
    isCollaborative, 
    {
      showMatchStatusColumn,
      showCustomAddColumn,
      showScrobbleDateColumn,
      showCumulativeTime,
      showDragHandle,
    }
  );

  const renderColumnHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
    const isActive = sortKey === key;
    
    return (
      <button
        onClick={() => onSort(key)}
        className={`
          flex items-center gap-1 w-full h-full font-medium uppercase tracking-wide
          hover:text-foreground transition-colors
          ${isActive ? 'text-foreground' : 'text-muted-foreground'}
          ${align === 'right' ? 'justify-end' : ''}
          ${isCompact ? 'text-[10px]' : 'text-xs'}
        `}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        {isActive && <SortIcon className={isCompact ? 'h-2.5 w-2.5 flex-shrink-0' : 'h-3 w-3 flex-shrink-0'} />}
      </button>
    );
  };

  // Same layout for all devices
  return (
    <div 
      data-table-header="true" 
      className={`sticky top-0 z-20 border-b border-border bg-card backdrop-blur-sm text-muted-foreground ${TRACK_GRID_CLASSES} ${isCompact ? 'h-8 ' + TRACK_GRID_CLASSES_COMPACT : 'h-10 ' + TRACK_GRID_CLASSES_NORMAL}`}
      style={gridStyle}
    >
      {/* Drag handle column - for touch devices */}
      {showDragHandle && (
        <div className="flex items-center justify-center" title="Drag handle">
          <GripVertical className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      )}

      {/* Match status column - for Last.fm import */}
      {showMatchStatusColumn && (
        <div className="flex items-center justify-center" title="Match status">
          <Radio className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      )}

      {/* Custom add column - for Last.fm import */}
      {showCustomAddColumn && (
        <div className="flex items-center justify-center" title="Add to marked insertion points">
          <Plus className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      )}

      {/* Contributor column - only for collaborative playlists */}
      {isCollaborative && (
        <div className="flex items-center justify-center" title="Added by">
          <Users className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      )}

      {/* Play button column - only when player is visible */}
      {isPlayerVisible && (
        <div className="flex items-center justify-center" title="Play">
          <Play className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      )}

      {/* Add to marked column - only when markers exist and not using custom add */}
      {showStandardAddColumn && (
        <div className="flex items-center justify-center" title="Add to marked insertion points">
          <Plus className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      )}

      {/* Liked status column */}
      {showLikedColumn ? (
        <div className="flex items-center justify-center" title="Liked status">
          <Heart className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      ) : (
        <div />
      )}

      {/* Position */}
      <div>{renderColumnHeader('#', 'position')}</div>

      {/* Title */}
      <div>{renderColumnHeader('Title', 'name')}</div>

      {/* Artist */}
      <div>{renderColumnHeader('Artist', 'artist')}</div>

      {/* Album - hidden on small screens, but keep grid slot */}
      <div className="hidden lg:block">{renderColumnHeader('Album', 'album')}</div>

      {/* Year - sortable by release date */}
      <div className="flex items-center justify-center" title="Release Year">
        <button
          onClick={() => onSort('year')}
          className={`flex items-center gap-0.5 transition-colors hover:text-foreground ${sortKey === 'year' ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          <Calendar className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          {sortKey === 'year' && <SortIcon className={isCompact ? 'h-2 w-2' : 'h-2.5 w-2.5'} />}
        </button>
      </div>

      {/* Popularity */}
      <div className="flex items-center justify-center" title="Popularity">
        <button
          onClick={() => onSort('popularity')}
          className={`flex items-center gap-0.5 transition-colors hover:text-foreground ${sortKey === 'popularity' ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          <TrendingUp className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          {sortKey === 'popularity' && <SortIcon className={isCompact ? 'h-2 w-2' : 'h-2.5 w-2.5'} />}
        </button>
      </div>

      {/* Duration - right aligned */}
      <div className="text-right">{renderColumnHeader('Time', 'duration', 'right')}</div>

      {/* Cumulative duration */}
      {showCumulativeTime && (
        <div className="flex items-center justify-end" title="Cumulative time from start">
          <Timer className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </div>
      )}
    </div>
  );
}
