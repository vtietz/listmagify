/**
 * InsertionMarker component - Visual line showing where tracks will be inserted.
 * Similar to DropIndicator but orange colored and with a toggle button.
 * Used to mark multiple insertion points within a playlist.
 */

'use client';

import { Plus, X } from 'lucide-react';
import { useCompactModeStore } from '@/hooks/useCompactModeStore';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import { cn } from '@/lib/utils';

interface InsertionMarkerProps {
  /** Playlist ID this marker belongs to */
  playlistId: string;
  /** Index where this marker would insert (insert-before semantics) */
  index: number;
  /** Y position in pixels (from virtualizer or calculated) */
  yPosition: number;
  /** Whether this marker is currently active */
  isActive: boolean;
  /** Whether to show the toggle button (hidden during drag operations) */
  showToggle?: boolean;
  /** Total number of tracks in the playlist (used to detect "after last" markers) */
  totalTracks: number;
}

/**
 * Renders an orange line indicator showing an insertion point.
 * Includes a toggle button on the left side to add/remove the marker.
 */
export function InsertionMarker({
  playlistId,
  index,
  yPosition,
  isActive,
  showToggle = true,
  totalTracks,
}: InsertionMarkerProps) {
  const { isCompact } = useCompactModeStore();
  const togglePoint = useInsertionPointsStore((s) => s.togglePoint);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    togglePoint(playlistId, index);
  };

  // Only render if marker is active or we need to show the toggle
  if (!isActive && !showToggle) {
    return null;
  }

  return (
    <div
      data-insertion-marker={isActive ? 'active' : 'inactive'}
      data-index={index}
      className="absolute left-0 w-full pointer-events-none"
      style={{
        top: 0,
        transform: `translateY(${yPosition}px)`,
        zIndex: 35, // Below drop indicator (40) but above rows
      }}
    >
      {/* 
       * Note: The orange insertion line is now rendered by TrackRow itself
       * via hasInsertionMarker/hasInsertionMarkerAfter props.
       * This overlay only renders the toggle button for "after last item" markers
       * where there's no TrackRow to show the line.
       */}
      {isActive && index >= totalTracks && (
        <div
          className="absolute left-0 w-full h-[3px] bg-orange-500 pointer-events-none"
          style={{
            boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)',
            top: '-1.5px',
          }}
        />
      )}

      {/* Toggle button - positioned at the left edge */}
      {showToggle && (
        <button
          type="button"
          onClick={handleToggle}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute pointer-events-auto',
            'flex items-center justify-center rounded-full',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1',
            isCompact ? 'w-4 h-4 -left-1' : 'w-5 h-5 -left-1',
            isActive
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-muted text-muted-foreground hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-950',
          )}
          style={{
            top: isCompact ? '-8px' : '-10px',
          }}
          aria-pressed={isActive}
          aria-label={isActive ? `Remove insertion point before row ${index + 1}` : `Add insertion point before row ${index + 1}`}
          title={isActive ? 'Remove insertion point' : 'Add insertion point'}
        >
          {isActive ? (
            <X className={cn(isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
          ) : (
            <Plus className={cn(isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
          )}
        </button>
      )}
    </div>
  );
}

interface InsertionMarkersOverlayProps {
  /** Playlist ID */
  playlistId: string;
  /** Total number of tracks (for "after last" marker) */
  totalTracks: number;
  /** Row height in pixels */
  rowHeight: number;
  /** Whether to show toggle buttons (hidden during drag) */
  showToggles?: boolean;
  /** Set of indices that have active markers */
  activeIndices: Set<number>;
}

/**
 * Renders all active insertion markers for a playlist.
 * This is an overlay component that sits on top of the virtualized list.
 * Note: Most marker lines are rendered by TrackRow itself - this overlay
 * only renders the line for "after last item" markers.
 */
export function InsertionMarkersOverlay({
  playlistId,
  totalTracks,
  rowHeight,
  showToggles = true,
  activeIndices,
}: InsertionMarkersOverlayProps) {
  return (
    <>
      {Array.from(activeIndices).map((index) => (
        <InsertionMarker
          key={`marker-${index}`}
          playlistId={playlistId}
          index={index}
          yPosition={index * rowHeight}
          isActive={true}
          showToggle={showToggles}
          totalTracks={totalTracks}
        />
      ))}
    </>
  );
}
