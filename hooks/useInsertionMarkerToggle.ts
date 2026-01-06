/**
 * Hook for managing insertion marker toggle behavior.
 * Handles edge detection and marker toggling for track rows.
 */

'use client';

import { useState, useCallback } from 'react';

// Edge detection thresholds in pixels
const EDGE_THRESHOLD_Y = 8;  // Vertical: how close to top/bottom edge
const EDGE_THRESHOLD_X = 30; // Horizontal: how close to left edge

export type NearEdge = 'top' | 'bottom' | null;

interface UseInsertionMarkerToggleOptions {
  /** Playlist ID for the insertion point */
  playlistId: string | undefined;
  /** Whether the panel is editable */
  isEditable: boolean;
  /** Whether the panel is locked */
  locked: boolean;
  /** Whether marker toggling is allowed (disabled during search/filter) */
  allowToggle: boolean;
  /** Actual position of the track in the playlist */
  trackPosition: number;
  /** Visual index of the track in the list */
  visualIndex: number;
  /** Function to toggle insertion point at a position */
  togglePoint: (playlistId: string, position: number) => void;
}

interface UseInsertionMarkerToggleReturn {
  /** Which edge the mouse is near (null if not near any edge) */
  nearEdge: NearEdge;
  /** Handler for mouse move events to detect edge proximity */
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Handler for mouse leave events to reset edge state */
  handleMouseLeave: () => void;
  /** Handler for clicking the insertion marker toggle button */
  handleInsertionMarkerToggle: (e: React.MouseEvent) => void;
}

/**
 * Hook to manage insertion marker toggle behavior.
 * Detects when the mouse is near the top/bottom edge of a row and handles toggling markers.
 */
export function useInsertionMarkerToggle({
  playlistId,
  isEditable,
  locked,
  allowToggle,
  trackPosition,
  visualIndex,
  togglePoint,
}: UseInsertionMarkerToggleOptions): UseInsertionMarkerToggleReturn {
  const [nearEdge, setNearEdge] = useState<NearEdge>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;
    
    // Only show toggle when mouse is near left edge AND near top/bottom edge
    const nearLeftEdge = relativeX <= EDGE_THRESHOLD_X;
    
    if (!nearLeftEdge) {
      setNearEdge(null);
      return;
    }
    
    // Check if mouse is near top or bottom edge
    if (relativeY <= EDGE_THRESHOLD_Y) {
      setNearEdge('top');
    } else if (relativeY >= rect.height - EDGE_THRESHOLD_Y) {
      setNearEdge('bottom');
    } else {
      setNearEdge(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setNearEdge(null);
  }, []);

  const handleInsertionMarkerToggle = useCallback((e: React.MouseEvent) => {
    // Stop propagation to prevent row selection/DnD interference
    e.stopPropagation();
    e.preventDefault();
    
    if (playlistId && isEditable && !locked && allowToggle) {
      // Use the track's actual playlist position, not visual index
      // This ensures markers work correctly even when the list is sorted/filtered
      const actualPosition = trackPosition ?? visualIndex;
      const targetPosition = nearEdge === 'bottom' ? actualPosition + 1 : actualPosition;
      togglePoint(playlistId, targetPosition);
    }
  }, [playlistId, isEditable, locked, allowToggle, trackPosition, visualIndex, nearEdge, togglePoint]);

  return {
    nearEdge,
    handleMouseMove,
    handleMouseLeave,
    handleInsertionMarkerToggle,
  };
}
