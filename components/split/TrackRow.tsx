/**
 * TrackRow component with drag-and-drop support and selection.
 * Renders a single track in a playlist panel.
 */

'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Track } from '@/lib/spotify/types';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface TrackRowProps {
  track: Track;
  index: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: (trackId: string, event: React.MouseEvent) => void;
  onClick: (trackId: string) => void;
  panelId?: string;
  playlistId?: string;
}

export function TrackRow({
  track,
  index,
  isSelected,
  isEditable,
  onSelect,
  onClick,
  panelId,
  playlistId,
}: TrackRowProps) {
  // Create globally unique composite ID scoped by panel
  const trackId = track.id || track.uri;
  const compositeId = panelId ? `${panelId}:${trackId}` : trackId;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: compositeId, // Globally unique ID
    disabled: !isEditable,
    animateLayoutChanges: () => false, // Disable "make room" animation for non-active items
    data: {
      type: 'track',
      trackId, // Keep pure Spotify ID for mutations
      track,
      panelId,
      playlistId,
      position: track.position ?? index, // Global position for mutations
    },
  });

  // Only apply transform/transition to the actively dragged item to prevent "make room" animation
  const style = {
    transform: isDragging ? CSS.Transform.toString(transform) : undefined,
    transition: isDragging ? transition : undefined,
  };

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
        'flex items-center gap-3 px-4 py-2 border-b border-border hover:bg-accent/50 cursor-pointer transition-colors',
        isSelected && 'bg-accent',
        isDragging && 'opacity-0'  // Hide the original item completely when dragging (overlay shows instead)
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
    >
      {isEditable && (
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
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
