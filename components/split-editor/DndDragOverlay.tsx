/**
 * DndDragOverlay - Presentational component for drag overlay visualization.
 * 
 * Displays the dragged track(s) with visual feedback for:
 * - Copy/move mode indication via cursor
 * - Target editability (not-allowed cursor when target is readonly)
 * - Multi-selection count badge
 * - Renders up to 3 actual track rows for visual consistency
 * 
 * Extracted from SplitGrid for better separation of concerns.
 */

'use client';

import { DragOverlay } from '@dnd-kit/core';
import type { Track } from '@/lib/spotify/types';
import { TrackRow } from './TrackRow';

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
      {/* Render track rows */}
      <div className="pointer-events-none">
        {visibleTracks.map((track, idx) => (
          <TrackRow
            key={`${track.uri}-${idx}`}
            track={track}
            index={idx}
            selectionKey={`drag-${idx}`}
            isSelected={false}
            isEditable={false}
            onSelect={() => {}}
            onClick={() => {}}
            showLikedColumn={false}
            showCumulativeTime={false}
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
