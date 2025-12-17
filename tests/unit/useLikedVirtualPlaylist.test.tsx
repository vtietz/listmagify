/**
 * Unit tests for useLikedVirtualPlaylist hook
 * Tests the virtual "Liked Songs" playlist functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useLikedVirtualPlaylist,
  isLikedSongsPlaylist,
  LIKED_SONGS_PLAYLIST_ID,
  LIKED_SONGS_METADATA,
} from '@/hooks/useLikedVirtualPlaylist';
import { useSavedTracksStore } from '@/hooks/useSavedTracksIndex';

// Mock apiFetch
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api/client';

const mockApiFetch = vi.mocked(apiFetch);

// Create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
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

describe('isLikedSongsPlaylist', () => {
  it('should return true for liked playlist ID', () => {
    expect(isLikedSongsPlaylist('liked')).toBe(true);
    expect(isLikedSongsPlaylist(LIKED_SONGS_PLAYLIST_ID)).toBe(true);
  });

  it('should return false for regular playlist IDs', () => {
    expect(isLikedSongsPlaylist('playlist123')).toBe(false);
    expect(isLikedSongsPlaylist('abc')).toBe(false);
    expect(isLikedSongsPlaylist('')).toBe(false);
  });

  it('should return false for null or undefined', () => {
    expect(isLikedSongsPlaylist(null)).toBe(false);
    expect(isLikedSongsPlaylist(undefined)).toBe(false);
  });
});

describe('LIKED_SONGS_METADATA', () => {
  it('should have correct ID', () => {
    expect(LIKED_SONGS_METADATA.id).toBe('liked');
  });

  it('should have correct name', () => {
    expect(LIKED_SONGS_METADATA.name).toBe('Liked Songs');
  });
});

describe('useLikedVirtualPlaylist', () => {
  beforeEach(() => {
    // Reset store state
    useSavedTracksStore.setState({
      likedIds: [],
      total: 0,
      isPrefetching: false,
      isPrefetchComplete: false,
      pendingContainsIds: [],
      error: null,
      lastUpdatedAt: 0,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch liked tracks from API', async () => {
    const mockTracks = [
      { id: 'track-1', name: 'Track 1', artists: [{ name: 'Artist 1' }] },
      { id: 'track-2', name: 'Track 2', artists: [{ name: 'Artist 2' }] },
    ];

    mockApiFetch.mockResolvedValueOnce({
      tracks: mockTracks,
      total: 2,
      nextCursor: null,
    });

    const { result } = renderHook(() => useLikedVirtualPlaylist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/liked/tracks?limit=50');
    expect(result.current.allTracks).toHaveLength(2);
    expect(result.current.allTracks[0].name).toBe('Track 1');
  });

  it('should handle pagination', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        tracks: [{ id: 'track-1', name: 'Track 1' }],
        total: 2,
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        tracks: [{ id: 'track-2', name: 'Track 2' }],
        total: 2,
        nextCursor: null,
      });

    const { result } = renderHook(() => useLikedVirtualPlaylist(), {
      wrapper: createWrapper(),
    });

    // Wait for both pages to load (auto-fetch enabled)
    await waitFor(() => {
      expect(result.current.hasLoadedAll).toBe(true);
    }, { timeout: 2000 });

    expect(result.current.allTracks).toHaveLength(2);
  });

  it('should update global likedSet when tracks are fetched', async () => {
    const mockTracks = [
      { id: 'track-1', name: 'Track 1' },
      { id: 'track-2', name: 'Track 2' },
    ];

    mockApiFetch.mockResolvedValueOnce({
      tracks: mockTracks,
      total: 2,
      nextCursor: null,
    });

    renderHook(() => useLikedVirtualPlaylist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const store = useSavedTracksStore.getState();
      // Store now uses likedIds array instead of likedSet
      expect(store.likedIds.includes('track-1')).toBe(true);
      expect(store.likedIds.includes('track-2')).toBe(true);
    });
  });

  it('should handle API errors gracefully', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('API Error'));

    const { result } = renderHook(() => useLikedVirtualPlaylist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.allTracks).toHaveLength(0);
  });

  it('should return empty tracks when no liked songs', async () => {
    mockApiFetch.mockResolvedValueOnce({
      tracks: [],
      total: 0,
      nextCursor: null,
    });

    const { result } = renderHook(() => useLikedVirtualPlaylist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.allTracks).toHaveLength(0);
    expect(result.current.hasLoadedAll).toBe(true);
  });
});
