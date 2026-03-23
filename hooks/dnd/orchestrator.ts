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

import { useRef, useCallback } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
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
import { usePendingActions } from '@/hooks/pending/usePendingActions';
import { TABLE_HEADER_HEIGHT, TABLE_HEADER_HEIGHT_COMPACT } from '@/components/split-editor/constants';
import type { Track } from '@/lib/music-provider/types';

import {
  useDndStateStore,
  type PanelConfig,
  type PanelVirtualizerData,
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
  activeSelectionCount: number;
  activeDragTracks: Track[];

  // DnD context props
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: CollisionDetection;
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
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
  const activeTrack = useDndStateStore((s) => s.activeTrack);
  const activeId = useDndStateStore((s) => s.activeId);
  const sourcePanelId = useDndStateStore((s) => s.sourcePanelId);
  const activePanelId = useDndStateStore((s) => s.activePanelId);
  const activeSelectionCount = useDndStateStore((s) => s.activeSelectionCount);
  const activeDragTracks = useDndStateStore((s) => s.activeDragTracks);

  const startDrag = useDndStateStore((s) => s.startDrag);
  const updateDropPosition = useDndStateStore((s) => s.updateDropPosition);
  const endDrag = useDndStateStore((s) => s.endDrag);
  const getFinalDropPosition = useDndStateStore((s) => s.getFinalDropPosition);
  const getSelectedIndices = useDndStateStore((s) => s.getSelectedIndices);
  const getOrderedTracksSnapshot = useDndStateStore((s) => s.getOrderedTracksSnapshot);

  // NOTE: dropIndicatorIndex and ephemeralInsertion are NOT subscribed here.
  // DropIndicator subscribes directly to the store, avoiding re-renders of the
  // entire SplitGrid tree on every drop-position change during drag.

  // === Infrastructure ===
  const pointerTracker = usePointerTracker();
  const autoScroller = useContinuousAutoScroll({ threshold: 80, maxSpeed: 15, minSpeed: 2 });
  const panelVirtualizersRef = useRef<Map<string, PanelVirtualizerData>>(new Map());

  // === Mutations ===
  const addTracks = useAddTracks();
  const removeTracks = useRemoveTracks();
  const reorderTracks = useReorderTracks();
  const { enqueuePendingFromBrowseDrop } = usePendingActions();

  // Check if any mutations are pending
  const isMutationPending = addTracks.isPending || removeTracks.isPending || reorderTracks.isPending;

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

  const dragOverFrameRef = useRef<number | null>(null);
  const queuedDragOverRef = useRef<DragMoveEvent | DragOverEvent | null>(null);

  const getActiveDragState = useCallback(() => {
    const state = useDndStateStore.getState();
    return {
      activeId: state.activeId,
      sourcePanelId: state.sourcePanelId,
      activeDragTracks: state.activeDragTracks,
    };
  }, []);

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
  // Disable drag initiation when mutations are pending to prevent race conditions
  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { distance: 8 },
      disabled: isMutationPending 
    }),
    useSensor(TouchSensor, { 
      activationConstraint: { delay: 100, tolerance: 8 },
      disabled: isMutationPending 
    }),
    useSensor(KeyboardSensor, { 
      coordinateGetter: sortableKeyboardCoordinates,
      disabled: isMutationPending 
    })
  );

  // === Event Handlers ===
  const handleDragStart = useCallback((event: DragStartEvent) => {
    createDragStartHandler({
      panels,
      panelVirtualizersRef,
      pointerTracker: pointerTracker as DragStartContext['pointerTracker'],
      autoScroller,
      startDrag,
    })(event);
  }, [panels, pointerTracker, autoScroller, startDrag]);

  const processDragOver = useCallback((event: DragMoveEvent | DragOverEvent) => {
    createDragOverHandler({
      panels,
      panelVirtualizersRef,
      pointerTracker: pointerTracker as DragOverContext['pointerTracker'],
      headerOffset,
      getActiveDragState,
      findPanelUnderPointer: findPanel,
      updateDropPosition,
    })(event);
  }, [panels, pointerTracker, headerOffset, getActiveDragState, findPanel, updateDropPosition]);

  // RAF-throttled position update — shared by onDragMove and onDragOver.
  // With per-row droppables removed (useDraggable instead of useSortable),
  // onDragOver only fires when the panel-level "over" target changes.
  // onDragMove fires on every pointer movement, keeping the indicator current.
  const throttledPositionUpdate = useCallback((event: DragMoveEvent | DragOverEvent) => {
    queuedDragOverRef.current = event;

    if (dragOverFrameRef.current !== null) {
      return;
    }

    dragOverFrameRef.current = requestAnimationFrame(() => {
      dragOverFrameRef.current = null;
      const queuedEvent = queuedDragOverRef.current;
      queuedDragOverRef.current = null;

      if (queuedEvent) {
        processDragOver(queuedEvent);
      }
    });
  }, [processDragOver]);

  const handleDragMove = throttledPositionUpdate;
  const handleDragOver = throttledPositionUpdate;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (dragOverFrameRef.current !== null) {
      cancelAnimationFrame(dragOverFrameRef.current);
      dragOverFrameRef.current = null;
      queuedDragOverRef.current = null;
    }

    createDragEndHandler({
      panels,
      panelVirtualizersRef,
      pointerTracker: pointerTracker as DragEndContext['pointerTracker'],
      mutations: { addTracks, removeTracks, reorderTracks } as unknown as DragEndContext['mutations'],
      enqueuePendingFromBrowseDrop,
      getFinalDropPosition,
      getSelectedIndices,
      getOrderedTracksSnapshot,
      endDrag,
    })(event);
  }, [
    panels,
    pointerTracker,
    addTracks,
    removeTracks,
    reorderTracks,
    enqueuePendingFromBrowseDrop,
    getFinalDropPosition,
    getSelectedIndices,
    getOrderedTracksSnapshot,
    endDrag,
  ]);

  const handleDragCancel = useCallback(() => {
    if (dragOverFrameRef.current !== null) {
      cancelAnimationFrame(dragOverFrameRef.current);
      dragOverFrameRef.current = null;
      queuedDragOverRef.current = null;
    }
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
    activeSelectionCount,
    activeDragTracks,

    // DnD context props
    sensors,
    collisionDetection,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
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
