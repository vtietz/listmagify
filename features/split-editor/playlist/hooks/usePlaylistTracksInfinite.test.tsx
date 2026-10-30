/**
 * Tests that usePlaylistTracksInfinite always ends up with every page loaded,
 * including after refetches that stop early or caches rebuilt from page 1.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/client';
import { playlistTracksInfiniteByProvider } from '@/lib/api/queryKeys';
import { usePlaylistTracksInfinite } from './usePlaylistTracksInfinite';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const PAGE_SIZE = 50;

let serverTrackCount = 0;

function pageFor(url: string) {
  const cursor = new URL(url, 'http://local').searchParams.get('nextCursor');
  const offset = cursor ? Number(cursor) : 0;
  const end = Math.min(offset + PAGE_SIZE, serverTrackCount);
  return {
    tracks: Array.from({ length: end - offset }, (_, i) => ({
      id: `t${offset + i}`,
      uri: `spotify:track:t${offset + i}`,
      name: `Track ${offset + i}`,
      artists: [],
      durationMs: 0,
    })),
    snapshotId: 'snap',
    total: serverTrackCount,
    nextCursor: end < serverTrackCount ? String(end) : null,
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => usePlaylistTracksInfinite({ playlistId: 'pl1', providerId: 'spotify' }), { wrapper });
  return { queryClient, ...hook };
}

describe('usePlaylistTracksInfinite', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => pageFor(url) as never);
  });

  it('loads every page on initial load', async () => {
    serverTrackCount = 120;
    const { result } = setup();

    await waitFor(() => expect(result.current.hasLoadedAll).toBe(true));
    expect(result.current.allTracks).toHaveLength(120);
  });

  it('loads the new tail after a refetch when the playlist grew past a page boundary', async () => {
    serverTrackCount = 100;
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.allTracks).toHaveLength(100));

    serverTrackCount = 130;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: playlistTracksInfiniteByProvider('pl1', 'spotify') });
    });

    await waitFor(() => expect(result.current.allTracks).toHaveLength(130));
    expect(result.current.hasLoadedAll).toBe(true);
  });

  it('recovers after the cache was rebuilt from the first page only', async () => {
    serverTrackCount = 150;
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.allTracks).toHaveLength(150));

    await act(async () => {
      await queryClient.resetQueries({ queryKey: playlistTracksInfiniteByProvider('pl1', 'spotify') });
    });

    await waitFor(() => {
      expect(result.current.hasLoadedAll).toBe(true);
      expect(result.current.allTracks).toHaveLength(150);
    });
    expect(queryClient.getQueryData<{ pages: unknown[] }>(
      playlistTracksInfiniteByProvider('pl1', 'spotify')
    )?.pages).toHaveLength(3);
  });
});
