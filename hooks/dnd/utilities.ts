/**
 * DnD Utility Functions
 *
 * Utility functions for DnD operations that don't fit in handlers or operations.
 */

import type { PanelConfig, PanelVirtualizerData } from './types';
import { logDebug } from '@/lib/utils/debug';

/**
 * Context for scroll utility
 */
export interface ScrollContext {
  panelVirtualizersRef: React.RefObject<Map<string, PanelVirtualizerData>>;
  playbackContext: { sourceId?: string } | null;
}

/**
 * Scroll to a track in the playing panel
 */
export function scrollToTrack(
  trackId: string,
  ctx: ScrollContext
): void {
  if (!trackId) return;

  const playingPanelId = ctx.playbackContext?.sourceId;
  if (!playingPanelId) {
    logDebug('scroll', 'No playback source panel found');
    return;
  }

  const panelData = ctx.panelVirtualizersRef.current?.get(playingPanelId);
  if (!panelData) {
    logDebug('scroll', `Playing panel ${playingPanelId} not registered`);
    return;
  }

  const { virtualizer, filteredTracks } = panelData;
  const trackIndex = filteredTracks.findIndex((track) => track.id === trackId);

  if (trackIndex !== -1) {
    try {
      virtualizer.scrollToIndex(trackIndex, { align: 'start' });
      logDebug('scroll', `Scrolled playing panel ${playingPanelId} to track ID: ${trackId} at index ${trackIndex}`);
    } catch (error) {
      console.error(`[ScrollToTrack] Failed to scroll panel ${playingPanelId}:`, error);
    }
  } else {
    logDebug('scroll', `Track ${trackId} not found in playing panel ${playingPanelId}`);
  }
}

/**
 * Context for mode utilities
 */
export interface ModeContext {
  panels: PanelConfig[];
  sourcePanelId: string | null;
  activePanelId: string | null;
  pointerTracker: {
    getModifiers: () => { ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
  };
}

/**
 * Get the effective DnD mode for the current drag operation
 */
export function getEffectiveDndMode(ctx: ModeContext): 'copy' | 'move' | null {
  if (!ctx.sourcePanelId) return null;

  if (ctx.activePanelId && ctx.activePanelId === ctx.sourcePanelId) {
    return 'move'; // Intra-panel interactions are always move
  }

  const sourcePanel = ctx.panels.find(p => p.id === ctx.sourcePanelId);
  if (!sourcePanel) return null;

  const sourceDndMode = sourcePanel.dndMode || 'copy';
  const { ctrlKey: isCtrlPressed } = ctx.pointerTracker.getModifiers();
  const canInvertMode = sourcePanel.isEditable;

  return (isCtrlPressed && canInvertMode)
    ? (sourceDndMode === 'copy' ? 'move' : 'copy')
    : sourceDndMode;
}

/**
 * Check if the current target panel is editable
 */
export function isTargetEditable(
  activePanelId: string | null,
  panels: PanelConfig[]
): boolean {
  if (!activePanelId) return true;

  const targetPanel = panels.find(p => p.id === activePanelId);
  return targetPanel?.isEditable ?? true;
}

/**
 * Find panel under pointer that accepts drops
 */
export function findPanelUnderPointer(
  pointerTracker: { getPosition: () => { x: number; y: number } },
  panelVirtualizersRef: React.RefObject<Map<string, PanelVirtualizerData>>
): { panelId: string } | null {
  const { x: pointerX, y: pointerY } = pointerTracker.getPosition();

  const panels = panelVirtualizersRef.current;
  if (!panels) return null;

  for (const [panelId, panelData] of panels.entries()) {
    const { scrollRef, canDrop } = panelData;
    // Skip panels that don't accept drops (sorted panels)
    if (!canDrop) continue;

    const container = scrollRef.current;
    if (!container) continue;

    const rect = container.getBoundingClientRect();
    if (
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top &&
      pointerY <= rect.bottom
    ) {
      return { panelId };
    }
  }

  return null;
}
