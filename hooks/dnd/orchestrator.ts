/**
 * DnD Orchestrator Hook (Refactored)
 *
 * Thin orchestrator that composes modular handlers and state management.
 * Responsibilities:
 * - Composing handlers from separate modules
 * - Managing sensor configuration
 * - Providing the public API for DnD operations
 *
 * This file should remain small (~200 lines) by delegating to:
 * - handlers/dragStart.ts - Drag initiation logic
 * - handlers/dragOver.ts - Drag movement logic
 * - handlers/dragEnd.ts - Drop execution logic
 * - state.ts - Zustand state store
 * - operations.ts - Pure business logic
 * - utilities.ts - Scroll and mode utilities
 * - collision.ts - Collision detection
 */

import { useRef, useCallback, useMemo } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Virtualizer } from '@tanstack/react-virtual';

import { usePointerTracker } from '../usePointerTracker';
import { useContinuousAutoScroll } from '../useAutoScrollEdge';
import { useHydratedCompactMode } from '../useCompactModeStore';
import { usePlayerStore } from '../usePlayerStore';
import { useAddTracks, useRemoveTracks, useReorderTracks } from '@/lib/spotify/playlistMutations';
import { TABLE_HEADER_HEIGHT, TABLE_HEADER_HEIGHT_COMPACT } from '@/components/split-editor/constants';
import type { Track } from '@/lib/spotify/types';

import {
  useDndStateStore,
  type PanelConfig,
  type PanelVirtualizerData,
  type EphemeralInsertion,
} from './';
import { createDragStartHandler, type DragStartContext } from './handlers/dragStart';
import { createDragOverHandler, type DragOverContext } from './handlers/dragOver';
import { createDragEndHandler, type DragEndContext } from './handlers/dragEnd';
import {
  scrollToTrack as scrollToTrackUtil,
  getEffectiveDndMode as getEffectiveDndModeUtil,
  isTargetEditable as isTargetEditableUtil,
  findPanelUnderPointer,
} from './utilities';

/**
 * Hook return type
 */
interface UseDndOrchestratorReturn {
  // Drag state
  activeTrack: Track | null;
  activeId: string | null;
  sourcePanelId: string | null;
  activePanelId: string | null;
  dropIndicatorIndex: number | null;
  ephemeralInsertion: EphemeralInsertion | null;
  activeSelectionCount: number;
  activeDragTracks: Track[];

  // DnD context props
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: CollisionDetection;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;

  // Panel virtualizer registry
  registerVirtualizer: (
    panelId: string,
    virtualizer: Virtualizer<HTMLDivElement, Element>,
    scrollRef: { current: HTMLDivElement | null },
    filteredTracks: Track[],
    canDrop: boolean
  ) => void;
  unregisterVirtualizer: (panelId: string) => void;

  // Utility functions
  getEffectiveDndMode: () => 'copy' | 'move' | null;
  isTargetEditable: () => boolean;
  scrollToTrack: (trackId: string) => void;
}

/**
 * DnD Orchestrator Hook
 */
export function useDndOrchestrator(panels: PanelConfig[]): UseDndOrchestratorReturn {
  // === State Management ===
  const {
    activeTrack,
    activeId,
    sourcePanelId,
    activePanelId,
    activeSelectionCount,
    activeDragTracks,
    dropIndicatorIndex,
    ephemeralInsertion,
    startDrag,
    updateDropPosition,
    endDrag,
    getFinalDropPosition,
    getSelectedIndices,
    getOrderedTracksSnapshot,
  } = useDndStateStore();

  // === Infrastructure ===
  const pointerTracker = usePointerTracker();
  const autoScroller = useContinuousAutoScroll({ threshold: 80, maxSpeed: 15, minSpeed: 2 });
  const panelVirtualizersRef = useRef<Map<string, PanelVirtualizerData>>(new Map());

  // === Mutations ===
  const addTracks = useAddTracks();
  const removeTracks = useRemoveTracks();
  const reorderTracks = useReorderTracks();

  // === Configuration ===
  const isCompact = useHydratedCompactMode();
  const headerOffset = isCompact ? TABLE_HEADER_HEIGHT_COMPACT : TABLE_HEADER_HEIGHT;
  const playbackContext = usePlayerStore((s) => s.playbackContext);

  // === Virtualizer Registry ===
  const registerVirtualizer = useCallback((
    panelId: string,
    virtualizer: Virtualizer<HTMLDivElement, Element>,
    scrollRef: { current: HTMLDivElement | null },
    filteredTracks: Track[],
    canDrop: boolean
  ) => {
    panelVirtualizersRef.current.set(panelId, { virtualizer, scrollRef, filteredTracks, canDrop });
  }, []);

  const unregisterVirtualizer = useCallback((panelId: string) => {
    panelVirtualizersRef.current.delete(panelId);
  }, []);

  // === Panel Detection ===
  const findPanel = useCallback(() => {
    return findPanelUnderPointer(pointerTracker, panelVirtualizersRef);
  }, [pointerTracker]);

  // === Collision Detection ===
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    const panelUnderPointer = findPanel();

    // Get track collisions from pointerWithin
    const trackCollisions = pointerCollisions.filter(
      (collision) => collision.data?.droppableContainer?.data?.current?.type === 'track'
    );

    // Validate track collisions against panel bounds
    if (trackCollisions.length > 0) {
      if (panelUnderPointer) {
        const targetPanelData = panelVirtualizersRef.current.get(panelUnderPointer.panelId);
        if (!targetPanelData?.canDrop) {
          return [];
        }

        const validTrackCollisions = trackCollisions.filter((collision) => {
          const trackPanelId = collision.data?.droppableContainer?.data?.current?.panelId;
          return trackPanelId === panelUnderPointer.panelId;
        });

        if (validTrackCollisions.length > 0) {
          return validTrackCollisions;
        }
      } else {
        const validTrackCollisions = trackCollisions.filter((collision) => {
          const trackPanelId = collision.data?.droppableContainer?.data?.current?.panelId;
          if (!trackPanelId) return false;
          const panelData = panelVirtualizersRef.current.get(trackPanelId);
          return panelData?.canDrop === true;
        });

        if (validTrackCollisions.length > 0) {
          return validTrackCollisions;
        }
      }
    }

    // Panel detection for gaps between tracks
    if (panelUnderPointer) {
      const panelDroppableId = `panel-${panelUnderPointer.panelId}`;
      const panelContainer = args.droppableContainers.find(
        (container) => container.id === panelDroppableId
      );

      if (panelContainer) {
        return [{
          id: panelDroppableId,
          data: { droppableContainer: panelContainer, value: 0 },
        }];
      }
    }

    return [];
  }, [findPanel]);

  // === Sensors ===
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // === Event Handlers ===
  const handleDragStart = useMemo(() => createDragStartHandler({
    panels,
    panelVirtualizersRef,
    pointerTracker: pointerTracker as DragStartContext['pointerTracker'],
    autoScroller,
    startDrag,
  }), [panels, pointerTracker, autoScroller, startDrag]);

  const handleDragOver = useMemo(() => createDragOverHandler({
    panels,
    panelVirtualizersRef,
    pointerTracker: pointerTracker as DragOverContext['pointerTracker'],
    headerOffset,
    activeId,
    sourcePanelId,
    activeDragTracks,
    findPanelUnderPointer: findPanel,
    updateDropPosition,
  }), [panels, pointerTracker, headerOffset, activeId, sourcePanelId, activeDragTracks, findPanel, updateDropPosition]);

  const handleDragEnd = useMemo(() => createDragEndHandler({
    panels,
    panelVirtualizersRef,
    pointerTracker: pointerTracker as DragEndContext['pointerTracker'],
    mutations: { addTracks, removeTracks, reorderTracks } as unknown as DragEndContext['mutations'],
    getFinalDropPosition,
    getSelectedIndices,
    getOrderedTracksSnapshot,
    endDrag,
  }), [panels, pointerTracker, addTracks, removeTracks, reorderTracks, getFinalDropPosition, getSelectedIndices, getOrderedTracksSnapshot, endDrag]);

  const handleDragCancel = useCallback(() => {
    endDrag();
    pointerTracker.stopTracking();
    autoScroller.stop();
  }, [endDrag, pointerTracker, autoScroller]);

  // === Utility Functions ===
  const getEffectiveDndMode = useCallback(
    () => getEffectiveDndModeUtil({ panels, sourcePanelId, activePanelId, pointerTracker }),
    [panels, sourcePanelId, activePanelId, pointerTracker]
  );

  const isTargetEditable = useCallback(
    () => isTargetEditableUtil(activePanelId, panels),
    [activePanelId, panels]
  );

  const scrollToTrack = useCallback(
    (trackId: string) => scrollToTrackUtil(trackId, { panelVirtualizersRef, playbackContext }),
    [playbackContext]
  );

  // === Public API ===
  return {
    // Drag state
    activeTrack,
    activeId,
    sourcePanelId,
    activePanelId,
    dropIndicatorIndex,
    ephemeralInsertion,
    activeSelectionCount,
    activeDragTracks,

    // DnD context props
    sensors,
    collisionDetection,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: handleDragCancel,

    // Panel virtualizer registry
    registerVirtualizer,
    unregisterVirtualizer,

    // Utility functions
    getEffectiveDndMode,
    isTargetEditable,
    scrollToTrack,
  };
}
