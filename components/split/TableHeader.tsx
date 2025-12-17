/**
 * TableHeader component for playlist tables with sortable columns.
 * Sticky header that remains visible during scroll.
 */

'use client';

import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { SortKey, SortDirection } from '@/hooks/usePlaylistSort';

interface TableHeaderProps {
  isEditable: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}

export function TableHeader({ isEditable, sortKey, sortDirection, onSort }: TableHeaderProps) {
  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  const renderColumnHeader = (label: string, key: SortKey, width?: string) => {
    const isActive = sortKey === key;
    
    return (
      <button
        onClick={() => onSort(key)}
        className={`
          flex items-center gap-1 px-2 h-full text-left text-xs font-medium uppercase tracking-wide
          hover:text-foreground transition-colors
          ${isActive ? 'text-foreground' : 'text-muted-foreground'}
          ${width || ''}
        `}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        {isActive && <SortIcon className="h-3 w-3 flex-shrink-0" />}
      </button>
    );
  };

  return (
    <div data-table-header="true" className="sticky top-0 z-20 flex items-center gap-3 px-4 h-10 border-b border-border bg-card backdrop-blur-sm text-muted-foreground min-w-max">
      {/* Grip column placeholder */}
      {isEditable && (
        <div className="flex-shrink-0 w-4">
          <GripVertical className="h-3 w-3 opacity-30" />
        </div>
      )}

      {/* Position */}
      <div className="flex-shrink-0 w-10">
        {renderColumnHeader('#', 'position', 'w-10')}
      </div>

      {/* Title */}
      <div className="flex-shrink-0 w-[200px]">
        {renderColumnHeader('Title', 'name', 'w-[200px]')}
      </div>

      {/* Artist */}
      <div className="flex-shrink-0 w-[160px]">
        {renderColumnHeader('Artist', 'artist', 'w-[160px]')}
      </div>

      {/* Album - hidden on small screens */}
      <div className="hidden lg:block flex-shrink-0 w-[160px]">
        {renderColumnHeader('Album', 'album', 'w-[160px]')}
      </div>

      {/* Duration */}
      <div className="flex-shrink-0 w-[60px] text-right">
        {renderColumnHeader('Time', 'duration', 'w-[60px]')}
      </div>
    </div>
  );
}
