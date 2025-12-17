/**
 * TableHeader component for playlist tables with sortable columns.
 * Sticky header that remains visible during scroll.
 */

'use client';

import { ArrowUp, ArrowDown, GripVertical, Heart, Play } from 'lucide-react';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

interface TableHeaderProps {
  isEditable: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  /** Whether to show the liked status column */
  showLikedColumn?: boolean;
}

/** Grid template for consistent column alignment between header and rows */
export const TRACK_GRID_CLASSES = 'grid items-center gap-3 px-4';
export const TRACK_GRID_STYLE = {
  // Play | Grip | Heart | # | Title (flex) | Artist (flex) | Time
  gridTemplateColumns: '32px 16px 32px 40px minmax(150px, 1fr) minmax(120px, 1fr) 60px',
};
export const TRACK_GRID_STYLE_WITH_ALBUM = {
  // Play | Grip | Heart | # | Title (flex) | Artist (flex) | Album (flex) | Time
  gridTemplateColumns: '32px 16px 32px 40px minmax(150px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) 60px',
};

export function TableHeader({ isEditable, sortKey, sortDirection, onSort, showLikedColumn = true }: TableHeaderProps) {
  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  const renderColumnHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
    const isActive = sortKey === key;
    
    return (
      <button
        onClick={() => onSort(key)}
        className={`
          flex items-center gap-1 w-full h-full text-xs font-medium uppercase tracking-wide
          hover:text-foreground transition-colors
          ${isActive ? 'text-foreground' : 'text-muted-foreground'}
          ${align === 'right' ? 'justify-end' : ''}
        `}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        {isActive && <SortIcon className="h-3 w-3 flex-shrink-0" />}
      </button>
    );
  };

  return (
    <div 
      data-table-header="true" 
      className={`sticky top-0 z-20 h-10 border-b border-border bg-card backdrop-blur-sm text-muted-foreground ${TRACK_GRID_CLASSES}`}
      style={TRACK_GRID_STYLE_WITH_ALBUM}
    >
      {/* Play button column */}
      <div className="flex items-center justify-center" title="Play">
        <Play className="h-3 w-3" />
      </div>

      {/* Grip column */}
      <div className="flex items-center justify-center">
        <GripVertical className="h-3 w-3 opacity-30" />
      </div>

      {/* Liked status column */}
      {showLikedColumn ? (
        <div className="flex items-center justify-center" title="Liked status">
          <Heart className="h-3 w-3" />
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

      {/* Duration - right aligned */}
      <div className="text-right">{renderColumnHeader('Time', 'duration', 'right')}</div>
    </div>
  );
}
