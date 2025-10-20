/**
 * TrackRow component with drag-and-drop support and selection.
 * Renders a single track in a playlist panel.
 */

'use client';

import { useSortable } from '@dnd-kit/sortable';
import type { Track } from '@/lib/spotify/types';
import { makeCompositeId, getTrackPosition } from '@/lib/dnd/id';
import { cn } from '@/lib/utils';
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

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

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
        'flex items-center gap-3 px-4 py-2 border-b border-border hover:bg-accent/50 transition-colors',
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
      {isEditable && (
        <div className="text-muted-foreground hover:text-foreground pointer-events-none">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{track.name}</div>
        <div className="text-sm text-muted-foreground truncate">
          {track.artists.join(', ')}
        </div>
      </div>

      {track.album?.name && (
        <div className="hidden md:block text-sm text-muted-foreground truncate max-w-[200px]">
          {track.album.name}
        </div>
      )}

      <div className="text-sm text-muted-foreground tabular-nums">
        {formatDuration(track.durationMs)}
      </div>
    </div>
  );
}
