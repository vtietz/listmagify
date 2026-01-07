/**
 * Panel Collision Detection Module
 * 
 * Extracts collision detection logic from useDndOrchestrator.
 * Provides bounds-validated collision detection for multi-panel DnD.
 */

import { useCallback } from 'react';
import {
  pointerWithin,
  type CollisionDetection,
} from '@dnd-kit/core';
import type { PanelVirtualizerData } from './types';

interface UsePointerPosition {
  getPosition: () => { x: number; y: number };
}

/**
 * Creates a custom collision detection strategy for multi-panel DnD.
 * 
 * Prioritizes track droppables over panel droppables and validates
 * collisions against actual panel scroll bounds.
 * 
 * @param panelVirtualizersRef - Ref to Map of panel virtualizer data
 * @param findPanelUnderPointer - Function to find which panel the pointer is over
 * @returns CollisionDetection function for DndContext
 */
export function usePanelCollisionDetection(
  panelVirtualizersRef: React.RefObject<Map<string, PanelVirtualizerData>>,
  pointerTracker: UsePointerPosition
): { collisionDetection: CollisionDetection; findPanelUnderPointer: () => { panelId: string } | null } {
  /**
   * Find panel under pointer that accepts drops.
   * Only returns panels where canDrop is true (not sorted).
   */
  const findPanelUnderPointer = useCallback((): { panelId: string } | null => {
    const { x: pointerX, y: pointerY } = pointerTracker.getPosition();
    
    for (const [panelId, panelData] of panelVirtualizersRef.current?.entries() ?? []) {
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
  }, [pointerTracker, panelVirtualizersRef]);

  /**
   * Custom collision detection that prioritizes track droppables over panel droppables.
   * 
   * For tracks: Use pointerWithin but validate against panel scroll bounds
   * For panels: Use our own findPanelUnderPointer() for precise bounds-based detection
   * 
   * This ensures all collision detection is based solely on scroll container bounds,
   * not on dnd-kit's collision detection which may be affected by DOM structure.
   */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    
    // First, determine which panel the pointer is actually in using our bounds check
    const panelUnderPointer = findPanelUnderPointer();
    
    // Get track collisions from pointerWithin
    const trackCollisions = pointerCollisions.filter(
      (collision) => collision.data?.droppableContainer?.data?.current?.type === 'track'
    );
    
    // If we have track collisions, validate they belong to a panel that accepts drops
    if (trackCollisions.length > 0) {
      if (panelUnderPointer) {
        // Check if the target panel accepts drops
        const targetPanelData = panelVirtualizersRef.current?.get(panelUnderPointer.panelId);
        if (!targetPanelData?.canDrop) {
          // Panel is sorted - don't accept any drops
          return [];
        }
        
        // Filter to only tracks from the panel that actually contains the pointer
        const validTrackCollisions = trackCollisions.filter((collision) => {
          const trackPanelId = collision.data?.droppableContainer?.data?.current?.panelId;
          return trackPanelId === panelUnderPointer.panelId;
        });
        
        if (validTrackCollisions.length > 0) {
          return validTrackCollisions;
        }
        // If no valid track collisions, fall through to panel detection
      } else {
        // No panel under pointer that accepts drops - filter track collisions to only those from droppable panels
        const validTrackCollisions = trackCollisions.filter((collision) => {
          const trackPanelId = collision.data?.droppableContainer?.data?.current?.panelId;
          if (!trackPanelId) return false;
          const panelData = panelVirtualizersRef.current?.get(trackPanelId);
          return panelData?.canDrop === true;
        });
        
        if (validTrackCollisions.length > 0) {
          return validTrackCollisions;
        }
      }
    }
    
    // For panel detection (gaps between tracks), use our bounds-based findPanelUnderPointer
    if (panelUnderPointer) {
      // Find the matching panel droppable from the collision args
      const droppableContainers = args.droppableContainers;
      const panelDroppableId = `panel-${panelUnderPointer.panelId}`;
      const panelContainer = droppableContainers.find(
        (container) => container.id === panelDroppableId
      );
      
      if (panelContainer) {
        // Return only the panel that actually contains the pointer
        return [{
          id: panelDroppableId,
          data: {
            droppableContainer: panelContainer,
            value: 0, // Distance value (0 = direct hit)
          },
        }];
      }
    }
    
    // No collisions found
    return [];
  }, [findPanelUnderPointer, panelVirtualizersRef]);

  return { collisionDetection, findPanelUnderPointer };
}
