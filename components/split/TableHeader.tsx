/**
 * TableHeader component for playlist tables with sortable columns.
 * Sticky header that remains visible during scroll.
 */

'use client';

import { ArrowUp, ArrowDown, GripVertical, Heart, Play, Plus } from 'lucide-react';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
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
export const TRACK_GRID_CLASSES = 'grid items-center';
export const TRACK_GRID_CLASSES_NORMAL = 'gap-2 px-3';
export const TRACK_GRID_CLASSES_COMPACT = 'gap-1 px-1.5';
export const TRACK_GRID_STYLE = {
  // Play | Add | Grip | Heart | # | Title (flex) | Artist (flex) | Time
  gridTemplateColumns: '24px 24px 12px 24px 32px minmax(150px, 1fr) minmax(120px, 1fr) 50px',
};
export const TRACK_GRID_STYLE_WITH_ALBUM = {
  // Play | Add | Grip | Heart | # | Title (flex) | Artist (flex) | Album (flex) | Time
  gridTemplateColumns: '24px 24px 12px 24px 32px minmax(150px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) 50px',
};

export function TableHeader({ isEditable, sortKey, sortDirection, onSort, showLikedColumn = true }: TableHeaderProps) {
  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;
  const { isCompact } = useCompactModeStore();

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

  return (
    <div 
      data-table-header="true" 
      className={`sticky top-0 z-20 border-b border-border bg-card backdrop-blur-sm text-muted-foreground ${TRACK_GRID_CLASSES} ${isCompact ? 'h-8 ' + TRACK_GRID_CLASSES_COMPACT : 'h-10 ' + TRACK_GRID_CLASSES_NORMAL}`}
      style={TRACK_GRID_STYLE_WITH_ALBUM}
    >
      {/* Play button column */}
      <div className="flex items-center justify-center" title="Play">
        <Play className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      </div>

      {/* Add to marked column */}
      <div className="flex items-center justify-center" title="Add to marked insertion points">
        <Plus className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      </div>

      {/* Grip column */}
      <div className="flex items-center justify-center">
        <GripVertical className={isCompact ? 'h-2.5 w-2.5 opacity-30' : 'h-3 w-3 opacity-30'} />
      </div>

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

      {/* Duration - right aligned */}
      <div className="text-right">{renderColumnHeader('Time', 'duration', 'right')}</div>
    </div>
  );
}
