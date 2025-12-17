/**
 * TrackRow component with drag-and-drop support and selection.
 * Renders a single track in a playlist panel.
 */

'use client';

import { useSortable } from '@dnd-kit/sortable';
import type { Track } from '@/lib/spotify/types';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';
import { GripVertical } from 'lucide-react';

interface TrackRowProps {
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
  /** True if this track is selected AND a drag is in progress from this panel */
  isDragSourceSelected?: boolean;
}

export function TrackRow({
  track,
  index,
  selectionKey,
  isSelected,
  isEditable,
  locked = false,
  onSelect,
  onClick,
  panelId,
  playlistId,
  dndMode = 'copy',
  isDragSourceSelected = false,
}: TrackRowProps) {
  // Create globally unique composite ID scoped by panel and position
  // Position is required to distinguish duplicate tracks (same song multiple times)
  const trackId = track.id || track.uri;
  const position = getTrackPosition(track, index);
  const compositeId = panelId ? makeCompositeId(panelId, trackId, position) : trackId;

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: compositeId, // Globally unique ID
    disabled: !isEditable || locked, // Disable if not editable OR locked
    animateLayoutChanges: () => false, // Disable "make room" animation for non-active items
    data: {
      type: 'track',
      trackId, // Keep pure Spotify ID for mutations
      track,
      panelId,
      playlistId,
      position, // Global position for mutations
    },
  });

  // Don't apply transform/transition - we use drag overlay and drop indicator instead
  // This prevents the original item from moving during drag
  const style = {};

  const { role: _attrRole, ...restAttributes } = attributes;

  const handleClick = (e: React.MouseEvent) => {
    // Prevent text selection when using modifier-based range/toggle selection
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onSelect(selectionKey, index, e);
    } else {
      onClick(selectionKey, index);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Avoid native text selection during modifier selection
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-4 h-12 border-b border-border transition-colors min-w-max',
        !isSelected && 'hover:bg-accent/40 hover:text-foreground',
        isSelected && 'bg-accent/70 text-foreground hover:bg-accent/80',
        // Visual feedback during drag - apply to dragged item OR all selected items in multi-select
        (isDragging || isDragSourceSelected) && dndMode === 'move' && 'opacity-0',
        (isDragging || isDragSourceSelected) && dndMode === 'copy' && 'opacity-50',
      )}
      id={`option-${panelId}-${index}`}
      role="option"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      aria-selected={isSelected}
      title={
        locked
          ? 'Panel is locked - unlock to enable dragging'
          : dndMode === 'copy'
            ? 'Click and drag to copy (Ctrl to move)'
            : 'Click and drag to move (Ctrl to copy)'
      }
      {...(isEditable && !locked ? { ...restAttributes, ...listeners } : {})}
    >
      {/* Grip handle for dragging */}
      {isEditable && (
        <div className="flex-shrink-0 text-muted-foreground hover:text-foreground pointer-events-none">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* Position number */}
      <div className="flex-shrink-0 w-10 text-sm text-muted-foreground tabular-nums">
        {track.position != null ? track.position + 1 : index + 1}
      </div>

      {/* Track title */}
      <div className="flex-shrink-0 w-[200px] min-w-0">
        <div className="text-sm truncate">{track.name}</div>
      </div>

      {/* Artist */}
      <div className="flex-shrink-0 w-[160px] min-w-0">
        <div className="text-sm text-muted-foreground truncate">
          {track.artists.join(', ')}
        </div>
      </div>

      {/* Album - hidden on small screens */}
      {track.album?.name && (
        <div className="hidden lg:block flex-shrink-0 w-[160px] min-w-0">
          <div className="text-sm text-muted-foreground truncate">
            {track.album.name}
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="flex-shrink-0 w-[60px] text-sm text-muted-foreground tabular-nums text-right">
        {formatDuration(track.durationMs)}
      </div>
    </div>
  );
}
