/**
 * DnD Sensors Configuration Module
 * 
 * Extracts sensor configuration from useDndOrchestrator for better modularity.
 * Provides configured sensors for drag-and-drop operations.
 */

import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Default activation constraint for pointer sensor.
 * Requires 8px of movement before drag starts to prevent
 * accidental drags from click events.
 */
export const DEFAULT_ACTIVATION_DISTANCE = 8;

/**
 * Hook to configure DnD sensors for track drag operations.
 * 
 * Uses:
 * - PointerSensor with activation distance to prevent accidental drags
 * - KeyboardSensor for accessibility with sortable keyboard coordinates
 * 
 * @param activationDistance - Minimum drag distance to activate (default: 8px)
 * @returns Configured sensors array for DndContext
 * 
 * @example
 * ```tsx
 * const sensors = useDndSensors();
 * 
 * return (
 *   <DndContext sensors={sensors}>
 *     {children}
 *   </DndContext>
 * );
 * ```
 */
export function useDndSensors(activationDistance: number = DEFAULT_ACTIVATION_DISTANCE) {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: activationDistance,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
}
