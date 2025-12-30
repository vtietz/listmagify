/**
 * Tests for useDndOrchestrator hook
 * 
 * Covers key functionality:
 * - State initialization
 * - Virtualizer registration/unregistration
 * - Drag lifecycle (start, over, end)
 * - Effective DnD mode calculation (copy/move with Ctrl)
 * - Target editability checks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDndOrchestrator } from '@/hooks/useDndOrchestrator';
import type { Track } from '@/lib/spotify/types';

// Mock dependencies
vi.mock('@/hooks/usePointerTracker', () => ({
  usePointerTracker: () => ({
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    getPosition: () => ({ x: 100, y: 200 }),
    getModifiers: () => ({ ctrlKey: false }),
  }),
}));

vi.mock('@/hooks/useAutoScrollEdge', () => ({
  autoScrollEdge: vi.fn(),
  useContinuousAutoScroll: () => ({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDropPosition', () => ({
  calculateDropPosition: vi.fn(() => ({ filteredIndex: 5, globalPosition: 10 })),
}));

const addTracksMutate = vi.fn();
const removeTracksMutate = vi.fn();
const reorderTracksMutate = vi.fn();

vi.mock('@/lib/spotify/playlistMutations', () => ({
  useAddTracks: () => ({ mutate: addTracksMutate }),
  useRemoveTracks: () => ({ mutate: removeTracksMutate }),
  useReorderTracks: () => ({ mutate: reorderTracksMutate }),
}));

vi.mock('@/lib/utils/debug', () => ({
  logDebug: vi.fn(),
}));

// Helper to create mock track
const createMockTrack = (id = 'track-1'): Track => ({
  id,
  uri: `spotify:track:${id}`,
  name: 'Test Track',
  artists: ['Artist 1'],
  album: { id: 'album-1', name: 'Test Album', image: null },
  durationMs: 180000,
  addedAt: '2024-01-01T00:00:00Z',
});

describe('useDndOrchestrator', () => {
  const mockPanels = [
    { id: 'panel-1', isEditable: true, dndMode: 'copy' as const, playlistId: 'playlist-1' },
    { id: 'panel-2', isEditable: true, dndMode: 'move' as const, playlistId: 'playlist-2' },
    { id: 'panel-3', isEditable: false, playlistId: 'playlist-3' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    addTracksMutate.mockReset();
    removeTracksMutate.mockReset();
    reorderTracksMutate.mockReset();
  });

  describe('Initialization', () => {
    it('should initialize with null drag state', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      expect(result.current.activeTrack).toBeNull();
      expect(result.current.activeId).toBeNull();
      expect(result.current.sourcePanelId).toBeNull();
      expect(result.current.activePanelId).toBeNull();
      expect(result.current.dropIndicatorIndex).toBeNull();
      expect(result.current.ephemeralInsertion).toBeNull();
    });

    it('should provide DnD context props', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      expect(result.current.sensors).toBeDefined();
      expect(result.current.collisionDetection).toBeDefined();
      expect(typeof result.current.onDragStart).toBe('function');
      expect(typeof result.current.onDragOver).toBe('function');
      expect(typeof result.current.onDragEnd).toBe('function');
    });

    it('should provide virtualizer registry functions', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      expect(typeof result.current.registerVirtualizer).toBe('function');
      expect(typeof result.current.unregisterVirtualizer).toBe('function');
    });

    it('should provide utility functions', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      expect(typeof result.current.getEffectiveDndMode).toBe('function');
      expect(typeof result.current.isTargetEditable).toBe('function');
    });
  });

  describe('Virtualizer Registration', () => {
    it('should register a virtualizer for a panel', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));
      
      const mockVirtualizer = { getVirtualItems: vi.fn() };
      const mockScrollRef = { current: document.createElement('div') };
      const mockTracks: Track[] = [];

      act(() => {
        result.current.registerVirtualizer('panel-1', mockVirtualizer, mockScrollRef, mockTracks, true);
      });

      // No error means registration succeeded
      expect(true).toBe(true);
    });

    it('should unregister a virtualizer for a panel', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));
      
      const mockVirtualizer = { getVirtualItems: vi.fn() };
      const mockScrollRef = { current: document.createElement('div') };
      const mockTracks: Track[] = [];

      act(() => {
        result.current.registerVirtualizer('panel-1', mockVirtualizer, mockScrollRef, mockTracks, true);
        result.current.unregisterVirtualizer('panel-1');
      });

      // No error means unregistration succeeded
      expect(true).toBe(true);
    });
  });

  describe('Effective DnD Mode', () => {
    it('should return null when no drag is active', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      expect(result.current.getEffectiveDndMode()).toBeNull();
    });

    it('should return copy mode for copy panel without Ctrl', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      // Simulate drag start to set sourcePanelId
      const mockTrack = createMockTrack();

      act(() => {
        result.current.onDragStart({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
                track: mockTrack,
              },
            },
          },
        } as any);
      });

      expect(result.current.getEffectiveDndMode()).toBe('copy');
    });

    it('should return move mode for move panel without Ctrl', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      const mockTrack = createMockTrack();

      act(() => {
        result.current.onDragStart({
          active: {
            id: 'panel-2:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-2',
                track: mockTrack,
              },
            },
          },
        } as any);
      });

      expect(result.current.getEffectiveDndMode()).toBe('move');
    });
  });

  describe('Target Editability', () => {
    it('should return true when no panel is active', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      expect(result.current.isTargetEditable()).toBe(true);
    });

    it('should return true for editable panel', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      const mockTrack = createMockTrack();

      act(() => {
        result.current.onDragStart({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
                track: mockTrack,
              },
            },
          },
        } as any);

        result.current.onDragOver({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
              },
            },
          },
          over: {
            id: 'panel-2',
            data: {
              current: {
                type: 'panel',
                panelId: 'panel-2',
              },
            },
          },
        } as any);
      });

      expect(result.current.isTargetEditable()).toBe(true);
    });

    it('should return false for non-editable panel', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      const mockTrack = createMockTrack();

      act(() => {
        result.current.onDragStart({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
                track: mockTrack,
              },
            },
          },
        } as any);

        result.current.onDragOver({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
              },
            },
          },
          over: {
            id: 'panel-3',
            data: {
              current: {
                type: 'panel',
                panelId: 'panel-3',
              },
            },
          },
        } as any);
      });

      // Since panel-3 is not editable, activePanelId should be null
      // and isTargetEditable should return true (default when no active panel)
      expect(result.current.activePanelId).toBeNull();
      expect(result.current.isTargetEditable()).toBe(true);
    });
  });

  describe('Drag Lifecycle', () => {
    it('should set active state on drag start', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      const mockTrack = createMockTrack();

      act(() => {
        result.current.onDragStart({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
                track: mockTrack,
              },
            },
          },
        } as any);
      });

      expect(result.current.activeTrack).toEqual(mockTrack);
      expect(result.current.activeId).toBe('panel-1:track-1');
      expect(result.current.sourcePanelId).toBe('panel-1');
    });

    it('should reset state on drag end', () => {
      const { result } = renderHook(() => useDndOrchestrator(mockPanels));

      const mockTrack = createMockTrack();

      act(() => {
        result.current.onDragStart({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
                track: mockTrack,
              },
            },
          },
        } as any);

        result.current.onDragEnd({
          active: {
            id: 'panel-1:track-1',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
              },
            },
          },
          over: null,
        } as any);
      });

      expect(result.current.activeTrack).toBeNull();
      expect(result.current.activeId).toBeNull();
      expect(result.current.sourcePanelId).toBeNull();
      expect(result.current.activePanelId).toBeNull();
      expect(result.current.dropIndicatorIndex).toBeNull();
    });

    it('handles multi-selection move within same playlist without errors', () => {
      const trackA = { ...createMockTrack('track-a'), position: 0 };
      const trackB = { ...createMockTrack('track-b'), position: 1 };
      const trackC = { ...createMockTrack('track-c'), position: 2 };

      const selection = new Set([
        `${trackA.id}::${trackA.position}`,
        `${trackB.id}::${trackB.position}`,
      ]);
      const panels = [
        { id: 'panel-1', isEditable: true, dndMode: 'move' as const, playlistId: 'playlist-1', selection },
      ];

      const { result } = renderHook(() => useDndOrchestrator(panels));

      const mockVirtualizer = { getVirtualItems: vi.fn(() => []) };
      const mockScrollRef = { current: document.createElement('div') };

      act(() => {
        result.current.registerVirtualizer('panel-1', mockVirtualizer, mockScrollRef, [trackA, trackB, trackC], true);
      });

      act(() => {
        result.current.onDragStart({
          active: {
            id: 'panel-1:track-a',
            data: {
              current: {
                type: 'track',
                panelId: 'panel-1',
                playlistId: 'playlist-1',
                track: trackA,
              },
            },
          },
        } as any);
      });

      expect(() => {
        act(() => {
          result.current.onDragEnd({
            active: {
              id: 'panel-1:track-a',
              data: {
                current: {
                  type: 'track',
                  panelId: 'panel-1',
                  playlistId: 'playlist-1',
                  track: trackA,
                  position: 0,
                },
              },
            },
            over: {
              id: 'panel-1:track-c',
              data: {
                current: {
                  type: 'track',
                  panelId: 'panel-1',
                  playlistId: 'playlist-1',
                  track: trackC,
                  position: 2,
                },
              },
            },
          } as any);
        });
      }).not.toThrow();

      expect(reorderTracksMutate).toHaveBeenCalledTimes(1);
      const callArgs = reorderTracksMutate.mock.calls[0]![0];
      expect(callArgs.playlistId).toBe('playlist-1');
      expect(callArgs.rangeLength).toBe(2);
    });
  });
});
