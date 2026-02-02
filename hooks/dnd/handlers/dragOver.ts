/**
 * Drag Over Handler
 *
 * Handles drag movement over drop targets, including:
 * - Determining which panel the pointer is over
 * - Computing drop position (filtered index and global position)
 * - Managing ephemeral insertion state for animations
 */

import type { DragOverEvent } from '@dnd-kit/core';
import type { Track } from '@/lib/spotify/types';
import type { PanelConfig, PanelVirtualizerData, EphemeralInsertion } from '../types';
import { calculateDropPosition } from '../../useDropPosition';

/**
 * Context required for drag over handling
 */
export interface DragOverContext {
  panels: PanelConfig[];
  panelVirtualizersRef: React.RefObject<Map<string, PanelVirtualizerData>>;
  pointerTracker: {
    getPosition: () => { x: number; y: number };
  };
  headerOffset: number;
  activeId: string | null;
  sourcePanelId: string | null;
  activeDragTracks: Track[];
  findPanelUnderPointer: () => { panelId: string } | null;
  updateDropPosition: (params: {
    activePanelId: string | null;
    computedDropPosition: number | null;
    dropIndicatorIndex: number | null;
    ephemeralInsertion: EphemeralInsertion | null;
  }) => void;
}

/**
 * Get target panel ID from drag over event
 */
function getTargetPanelId(
  event: DragOverEvent,
  findPanelUnderPointer: () => { panelId: string } | null
): string | null {
  const { over } = event;

  if (over) {
    const targetData = over.data.current;

    if (targetData?.type === 'track') {
      return targetData.panelId;
    } else if (targetData?.type === 'panel') {
      return targetData.panelId as string;
    }
  }

  // No collision detected - find panel under pointer as fallback
  const panelUnderPointer = findPanelUnderPointer();
  return panelUnderPointer?.panelId ?? null;
}

/**
 * Create drag over handler
 */
export function createDragOverHandler(ctx: DragOverContext) {
  return (event: DragOverEvent): void => {
    if (!ctx.activeId) {
      ctx.updateDropPosition({
        activePanelId: null,
        computedDropPosition: null,
        dropIndicatorIndex: null,
        ephemeralInsertion: null,
      });
      return;
    }

    const targetPanelId = getTargetPanelId(event, ctx.findPanelUnderPointer);

    if (!targetPanelId) {
      ctx.updateDropPosition({
        activePanelId: null,
        computedDropPosition: null,
        dropIndicatorIndex: null,
        ephemeralInsertion: null,
      });
      return;
    }

    // Check if target panel is editable
    const targetPanel = ctx.panels.find(p => p.id === targetPanelId);
    if (!targetPanel || !targetPanel.isEditable) {
      ctx.updateDropPosition({
        activePanelId: null,
        computedDropPosition: null,
        dropIndicatorIndex: null,
        ephemeralInsertion: null,
      });
      return;
    }

    const { y: pointerY } = ctx.pointerTracker.getPosition();
    const panelData = ctx.panelVirtualizersRef.current?.get(targetPanelId);

    if (!panelData) {
      ctx.updateDropPosition({
        activePanelId: targetPanelId,
        computedDropPosition: null,
        dropIndicatorIndex: null,
        ephemeralInsertion: null,
      });
      return;
    }

    const { virtualizer, scrollRef, filteredTracks } = panelData;
    const scrollContainer = scrollRef.current;

    // Get dragged track positions for exclusion from targeting
    const draggedTrackPositions = ctx.activeDragTracks
      .map(t => t.position)
      .filter((p): p is number => p != null);
    const dragCount = ctx.activeDragTracks.length || 1;

    // Compute the global playlist position and filtered index
    // This now accounts for multi-select overlay height and excludes dragged tracks
    const dropData = scrollContainer
      ? calculateDropPosition(
          scrollContainer,
          virtualizer,
          filteredTracks,
          pointerY,
          ctx.headerOffset,
          draggedTrackPositions,
          dragCount
        )
      : null;

    if (dropData) {
      ctx.updateDropPosition({
        activePanelId: targetPanelId,
        computedDropPosition: dropData.globalPosition,
        dropIndicatorIndex: dropData.filteredIndex,
        ephemeralInsertion: ctx.sourcePanelId ? {
          activeId: ctx.activeId,
          sourcePanelId: ctx.sourcePanelId,
          targetPanelId,
          insertionIndex: dropData.filteredIndex, // Use same index as drop indicator
        } : null,
      });

      console.debug('[DND] over', {
        targetPanelId,
        insertionIdxFiltered: dropData.filteredIndex,
        dropIndicatorIndex: dropData.filteredIndex,
        computedDropPosition: dropData.globalPosition
      });
    } else {
      ctx.updateDropPosition({
        activePanelId: targetPanelId,
        computedDropPosition: null,
        dropIndicatorIndex: null,
        ephemeralInsertion: null,
      });
    }
  };
}
