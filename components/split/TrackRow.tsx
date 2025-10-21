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
  isSelected: boolean;
  isEditable: boolean;
  locked?: boolean;
  onSelect: (trackId: string, event: React.MouseEvent) => void;
  onClick: (trackId: string) => void;
  panelId?: string;
  playlistId?: string;
  dndMode?: 'copy' | 'move';
}

export function TrackRow({
  track,
  index,
  isSelected,
  isEditable,
  locked = false,
  onSelect,
  onClick,
  panelId,
  playlistId,
  dndMode = 'copy',
}: TrackRowProps) {
  // Create globally unique composite ID scoped by panel
  const trackId = track.id || track.uri;
  const compositeId = panelId ? makeCompositeId(panelId, trackId) : trackId;

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
      position: getTrackPosition(track, index), // Global position for mutations
    },
  });

  // Don't apply transform/transition - we use drag overlay and drop indicator instead
  // This prevents the original item from moving during drag
  const style = {};

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onSelect(trackId, e);
    } else {
      onClick(trackId);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-4 h-12 border-b border-border hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent',
        // Cursor feedback - show grab/copy only when draggable
        !locked && isEditable && dndMode === 'move' && 'cursor-grab active:cursor-grabbing',
        !locked && isEditable && dndMode === 'copy' && 'cursor-copy',
        // Visual feedback during drag
        isDragging && dndMode === 'move' && 'opacity-0',
        isDragging && dndMode === 'copy' && 'opacity-50',
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      title={
        locked
          ? 'Panel is locked - unlock to enable dragging'
          : dndMode === 'copy'
            ? 'Click and drag to copy (Ctrl to move)'
            : 'Click and drag to move (Ctrl to copy)'
      }
      {...(isEditable && !locked ? { ...attributes, ...listeners } : {})}
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
