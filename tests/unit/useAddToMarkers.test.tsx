/**
 * Tests for useAddToMarkers hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAddToMarkers } from '@/hooks/useAddToMarkers';
import { useInsertionPointsStore } from '@/hooks/useInsertionPointsStore';
import * as playlistMutations from '@/lib/spotify/playlistMutations';

// Helper to create insertion point objects
const createMarker = (index: number) => ({
  markerId: `marker-${index}`,
  index,
  createdAt: Date.now(),
});

// Mock the playlist mutations
vi.mock('@/lib/spotify/playlistMutations', () => ({
  useAddTracks: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  })),
}));

// Mock the toast
vi.mock('@/lib/ui/toast', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useAddToMarkers', () => {
  beforeEach(() => {
    // Reset the store
    useInsertionPointsStore.setState({ playlists: {} });
    vi.clearAllMocks();
  });

  it('returns hasActiveMarkers=false when no markers exist', () => {
    const { result } = renderHook(() => useAddToMarkers(), { wrapper: createWrapper() });
    
    expect(result.current.hasActiveMarkers).toBe(false);
    expect(result.current.totalMarkers).toBe(0);
  });

  it('returns hasActiveMarkers=true when markers exist', () => {
    // Set up markers in store
    useInsertionPointsStore.setState({
      playlists: {
        'playlist-1': { markers: [createMarker(0), createMarker(5), createMarker(10)] },
      },
    });

    const { result } = renderHook(() => useAddToMarkers(), { wrapper: createWrapper() });
    
    expect(result.current.hasActiveMarkers).toBe(true);
    expect(result.current.totalMarkers).toBe(3);
  });

  it('excludes specified playlist from markers', () => {
    useInsertionPointsStore.setState({
      playlists: {
        'playlist-1': { markers: [createMarker(0), createMarker(5)] },
        'playlist-2': { markers: [createMarker(3)] },
      },
    });

    const { result } = renderHook(
      () => useAddToMarkers({ excludePlaylistId: 'playlist-1' }), 
      { wrapper: createWrapper() }
    );
    
    expect(result.current.hasActiveMarkers).toBe(true);
    expect(result.current.totalMarkers).toBe(1); // Only playlist-2's marker
  });

  it('addToMarkers does nothing when no markers exist', async () => {
    const { result } = renderHook(() => useAddToMarkers(), { wrapper: createWrapper() });
    
    await act(async () => {
      await result.current.addToMarkers(['spotify:track:abc']);
    });

    const mockMutateAsync = vi.mocked(playlistMutations.useAddTracks().mutateAsync);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('addToMarkers does nothing when uris array is empty', async () => {
    useInsertionPointsStore.setState({
      playlists: {
        'playlist-1': { markers: [createMarker(0)] },
      },
    });

    const { result } = renderHook(() => useAddToMarkers(), { wrapper: createWrapper() });
    
    await act(async () => {
      await result.current.addToMarkers([]);
    });

    const mockMutateAsync = vi.mocked(playlistMutations.useAddTracks().mutateAsync);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
