/**
 * Drag Over Handler
 *
 * Handles drag movement over drop targets, including:
 * - Determining which panel the pointer is over
 * - Computing drop position (filtered index and global position)
 * - Managing ephemeral insertion state for animations
 */

import type { DragMoveEvent } from '@dnd-kit/core';
import type { Track } from '@/lib/music-provider/types';
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
  getActiveDragState: () => {
    activeId: string | null;
    sourcePanelId: string | null;
    activeDragTracks: Track[];
  };
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
  event: DragMoveEvent,
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

function resetDropPosition(ctx: DragOverContext, activePanelId: string | null = null): void {
  ctx.updateDropPosition({
    activePanelId,
    computedDropPosition: null,
    dropIndicatorIndex: null,
    ephemeralInsertion: null,
  });
}

function canDropOnPanel(ctx: DragOverContext, targetPanelId: string, sourcePanelId: string | null): boolean {
  const targetPanel = ctx.panels.find((panel) => panel.id === targetPanelId);
  if (!targetPanel || !targetPanel.isEditable) {
    return false;
  }

  const sourcePanel = sourcePanelId
    ? ctx.panels.find((panel) => panel.id === sourcePanelId)
    : null;

  if (!sourcePanel?.providerId || !targetPanel.providerId) {
    return true;
  }

  return sourcePanel.providerId === targetPanel.providerId;
}

function resolveDropData(
  ctx: DragOverContext,
  targetPanelId: string,
  activeDragTracks: Track[]
) {
  const { y: pointerY } = ctx.pointerTracker.getPosition();
  const panelData = ctx.panelVirtualizersRef.current?.get(targetPanelId);
  if (!panelData) {
    return null;
  }

  const { virtualizer, scrollRef, filteredTracks } = panelData;
  const scrollContainer = scrollRef.current;
  if (!scrollContainer) {
    return null;
  }

  const draggedTrackPositions = activeDragTracks
    .map((track) => track.position)
    .filter((position): position is number => position != null);

  return calculateDropPosition(
    scrollContainer,
    virtualizer,
    filteredTracks,
    pointerY,
    ctx.headerOffset,
    draggedTrackPositions,
    activeDragTracks.length || 1
  );
}

function buildEphemeralInsertion(
  activeId: string,
  sourcePanelId: string | null,
  targetPanelId: string,
  insertionIndex: number
): EphemeralInsertion | null {
  if (!sourcePanelId) {
    return null;
  }

  return {
    activeId,
    sourcePanelId,
    targetPanelId,
    insertionIndex,
  };
}

/**
 * Create drag over handler
 */
export function createDragOverHandler(ctx: DragOverContext) {
  return (event: DragMoveEvent): void => {
    const { activeId, sourcePanelId, activeDragTracks } = ctx.getActiveDragState();

    if (!activeId) {
      resetDropPosition(ctx);
      return;
    }

    const targetPanelId = getTargetPanelId(event, ctx.findPanelUnderPointer);

    if (!targetPanelId) {
      resetDropPosition(ctx);
      return;
    }

    if (!canDropOnPanel(ctx, targetPanelId, sourcePanelId)) {
      resetDropPosition(ctx);
      return;
    }

    const dropData = resolveDropData(ctx, targetPanelId, activeDragTracks);
    if (!dropData) {
      resetDropPosition(ctx, targetPanelId);
      return;
    }

    ctx.updateDropPosition({
      activePanelId: targetPanelId,
      computedDropPosition: dropData.globalPosition,
      dropIndicatorIndex: dropData.filteredIndex,
      ephemeralInsertion: buildEphemeralInsertion(activeId, sourcePanelId, targetPanelId, dropData.filteredIndex),
    });
  };
}
