/**
 * Drag Over Handler
 *
 * Handles drag movement over drop targets, including:
 * - Determining which panel the pointer is over
 * - Computing drop position (filtered index and global position)
 * - Managing ephemeral insertion state for animations
 */

import type { DragOverEvent } from '@dnd-kit/core';
import type { Virtualizer } from '@tanstack/react-virtual';
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
 * Compute insertion index for "make room" animation
 */
function computeInsertionIndex(
  pointerY: number,
  headerOffset: number,
  scrollContainer: HTMLDivElement,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  filteredTracks: Track[]
): number {
  const containerRect = scrollContainer.getBoundingClientRect();
  const scrollTop = scrollContainer.scrollTop;
  const relativeY = pointerY - containerRect.top + scrollTop - headerOffset;

  const virtualItems = virtualizer.getVirtualItems();
  const rowSize = virtualItems.length > 0 && virtualItems[0] ? virtualItems[0].size : 48;
  const adjustedY = relativeY - (rowSize / 2);
  let insertionIndex = filteredTracks.length;

  for (let i = 0; i < virtualItems.length; i++) {
    const item = virtualItems[i];
    if (!item) continue;
    const itemMiddle = item.start + item.size / 2;

    if (adjustedY < itemMiddle) {
      insertionIndex = item.index;
      break;
    }
  }

  return insertionIndex;
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

    // Compute insertion index for "make room" animation
    let insertionIndex = filteredTracks.length;
    if (scrollContainer) {
      insertionIndex = computeInsertionIndex(
        pointerY,
        ctx.headerOffset,
        scrollContainer,
        virtualizer,
        filteredTracks
      );
    }

    // Compute the global playlist position and filtered index
    const dropData = scrollContainer
      ? calculateDropPosition(scrollContainer, virtualizer, filteredTracks, pointerY, ctx.headerOffset)
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
          insertionIndex,
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
