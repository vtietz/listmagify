/**
 * DndDragOverlay - Presentational component for drag overlay visualization.
 * 
 * Displays the dragged track(s) with visual feedback for:
 * - Copy/move mode indication via cursor
 * - Target editability (not-allowed cursor when target is readonly)
 * - Multi-selection count badge
 * - Renders up to 3 lightweight row previews for visual consistency
 * 
 * Extracted from SplitGrid for better separation of concerns.
 */

'use client';

import { DragOverlay } from '@dnd-kit/core';
import type { Track } from '@/lib/music-provider/types';
import { useHydratedCompactMode } from '@/hooks/useCompactModeStore';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';
import {
  TRACK_GRID_CLASSES,
  TRACK_GRID_CLASSES_COMPACT,
  TRACK_GRID_CLASSES_NORMAL,
  getTrackGridStyle,
} from './TableHeader';

interface DndDragOverlayProps {
  /** All tracks being dragged (up to 3 will be rendered) */
  draggedTracks: Track[];
  /** Get the effective DnD mode ('copy' | 'move' | null) */
  getEffectiveDndMode: () => 'copy' | 'move' | null;
  /** Check if current target panel is editable */
  isTargetEditable: () => boolean;
}

export function DndDragOverlay({
  draggedTracks,
  getEffectiveDndMode,
  isTargetEditable,
}: DndDragOverlayProps) {
  const hasAnyTracks = draggedTracks.length > 0;
  
  return (
    <DragOverlay dropAnimation={null}>
      {hasAnyTracks && (
        <DragOverlayContent
          tracks={draggedTracks}
          effectiveMode={getEffectiveDndMode()}
          targetEditable={isTargetEditable()}
        />
      )}
    </DragOverlay>
  );
}

interface DragOverlayContentProps {
  tracks: Track[];
  effectiveMode: 'copy' | 'move' | null;
  targetEditable: boolean;
}

function DragOverlayContent({
  tracks,
  effectiveMode,
  targetEditable,
}: DragOverlayContentProps) {
  const cursorStyle = !targetEditable 
    ? 'not-allowed' 
    : (effectiveMode === 'move' ? 'grabbing' : 'copy');

  // Show up to 3 tracks, with a badge for additional tracks
  const maxVisible = 3;
  const visibleTracks = tracks.slice(0, maxVisible);
  const remainingCount = Math.max(0, tracks.length - maxVisible);
  
  return (
    <div 
      className="relative bg-card border-2 border-primary rounded shadow-2xl opacity-95"
      style={{ cursor: cursorStyle }}
    >
      {/* Render lightweight row previews (same layout, no DnD hooks) */}
      <div className="pointer-events-none">
        {visibleTracks.map((track, idx) => (
          <DragOverlayTrackRow
            key={`${track.uri}-${idx}`}
            track={track}
            index={idx}
          />
        ))}
      </div>
      
      {/* Badge showing additional track count */}
      {remainingCount > 0 && (
        <div className="absolute top-2 right-2 z-20">
          <div className="bg-primary text-primary-foreground px-2 py-1 rounded-md font-semibold shadow-lg text-sm">
            +{remainingCount}
          </div>
        </div>
      )}
    </div>
  );
}

interface DragOverlayTrackRowProps {
  track: Track;
  index: number;
}

function DragOverlayTrackRow({ track, index }: DragOverlayTrackRowProps) {
  const isCompact = useHydratedCompactMode();
  const gridStyle = getTrackGridStyle(true, true, false, { showCumulativeTime: false });

  return (
    <div
      style={gridStyle}
      className={cn(
        TRACK_GRID_CLASSES,
        isCompact ? `h-7 ${TRACK_GRID_CLASSES_COMPACT}` : `h-10 ${TRACK_GRID_CLASSES_NORMAL}`,
        'border-b border-border bg-card items-center'
      )}
    >
      <div className="h-4 w-4 rounded-sm bg-muted/60" />
      <div className="h-4 w-4 rounded-sm bg-muted/60" />
      <div className="h-4 w-4 rounded-sm bg-muted/40" />
      <div className={cn('text-muted-foreground tabular-nums', isCompact ? 'text-xs' : 'text-sm')}>
        {index + 1}
      </div>
      <div className="min-w-0 truncate text-sm">{track.name}</div>
      <div className="min-w-0 truncate text-xs text-muted-foreground">{track.artists?.join(', ') || ''}</div>
      <div className="min-w-0 truncate text-xs text-muted-foreground">{track.album?.name || ''}</div>
      <div className="text-[10px] text-muted-foreground">{track.album?.releaseDate?.slice(0, 4) || ''}</div>
      <div className="h-2 w-8 rounded bg-muted/40" />
      <div className={cn('tabular-nums text-muted-foreground', isCompact ? 'text-xs' : 'text-sm')}>
        {formatDuration(track.durationMs)}
      </div>
    </div>
  );
}
