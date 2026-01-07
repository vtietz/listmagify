/**
 * DndDragOverlay - Presentational component for drag overlay visualization.
 * 
 * Displays the dragged track(s) with visual feedback for:
 * - Copy/move mode indication via cursor
 * - Target editability (not-allowed cursor when target is readonly)
 * - Multi-selection count badge
 * 
 * Extracted from SplitGrid for better separation of concerns.
 */

'use client';

import { DragOverlay } from '@dnd-kit/core';
import type { Track } from '@/lib/spotify/types';
import { TRACK_ROW_HEIGHT, TRACK_ROW_HEIGHT_COMPACT } from './constants';

interface DndDragOverlayProps {
  /** Currently dragged track (null when no drag active) */
  activeTrack: Track | null;
  /** Number of selected tracks being dragged */
  activeSelectionCount: number;
  /** Whether compact mode is enabled */
  isCompact: boolean;
  /** Get the effective DnD mode ('copy' | 'move' | null) */
  getEffectiveDndMode: () => 'copy' | 'move' | null;
  /** Check if current target panel is editable */
  isTargetEditable: () => boolean;
}

export function DndDragOverlay({
  activeTrack,
  activeSelectionCount,
  isCompact,
  getEffectiveDndMode,
  isTargetEditable,
}: DndDragOverlayProps) {
  return (
    <DragOverlay dropAnimation={null}>
      {activeTrack && (
        <DragOverlayContent
          track={activeTrack}
          selectionCount={activeSelectionCount}
          isCompact={isCompact}
          effectiveMode={getEffectiveDndMode()}
          targetEditable={isTargetEditable()}
        />
      )}
    </DragOverlay>
  );
}

interface DragOverlayContentProps {
  track: Track;
  selectionCount: number;
  isCompact: boolean;
  effectiveMode: 'copy' | 'move' | null;
  targetEditable: boolean;
}

function DragOverlayContent({
  track,
  selectionCount,
  isCompact,
  effectiveMode,
  targetEditable,
}: DragOverlayContentProps) {
  const cursorStyle = !targetEditable 
    ? 'not-allowed' 
    : (effectiveMode === 'move' ? 'grabbing' : 'copy');

  const extraCount = Math.max(0, (selectionCount || 1) - 1);
  const rowHeight = isCompact ? TRACK_ROW_HEIGHT_COMPACT : TRACK_ROW_HEIGHT;
  
  return (
    <div 
      className={`flex items-center bg-card border-2 border-primary rounded shadow-2xl opacity-95 ${isCompact ? 'gap-1 px-1.5 text-xs' : 'gap-2 px-3 text-sm'}`}
      style={{ cursor: cursorStyle, height: `${rowHeight}px`, minWidth: isCompact ? '400px' : '500px' }}
    >
      {/* Track title */}
      <div className={`flex-shrink-0 min-w-0 ${isCompact ? 'w-[140px]' : 'w-[180px]'}`}>
        <div className="truncate">
          {track.name}
        </div>
      </div>

      {/* Artist */}
      <div className={`flex-shrink-0 min-w-0 ${isCompact ? 'w-[100px]' : 'w-[140px]'}`}>
        <div className="text-muted-foreground truncate">
          {track.artistObjects && track.artistObjects.length > 0
            ? track.artistObjects.map(a => a.name).join(', ')
            : track.artists.join(', ')}
        </div>
      </div>

      {/* Album */}
      {track.album?.name && (
        <div className={`flex-shrink-0 min-w-0 ${isCompact ? 'w-[100px]' : 'w-[140px]'}`}>
          <div className="text-muted-foreground truncate">
            {track.album.name}
          </div>
        </div>
      )}

      {/* Multi-selection count badge */}
      {extraCount > 0 && (
        <div className="flex-shrink-0 text-xs font-medium text-muted-foreground">
          +{extraCount}
        </div>
      )}
    </div>
  );
}
