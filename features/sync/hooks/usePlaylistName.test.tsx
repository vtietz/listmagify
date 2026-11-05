import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as apiClient from '@/lib/api/client';
import { usePlaylistName, useResolvedPlaylistName } from '@features/sync/hooks/usePlaylistName';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

const PLAYLIST_ID = '4hu6d8wg2TwtAbCdEfGhIj';

describe('usePlaylistName', () => {
  const mockApiFetch = vi.mocked(apiClient.apiFetch);
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('resolves to null instead of the ID placeholder while the name is unknown', async () => {
    mockApiFetch.mockRejectedValue(new Error('Request failed: 429'));

    const { result } = renderHook(() => useResolvedPlaylistName('spotify', PLAYLIST_ID), { wrapper });

    expect(result.current).toBeNull();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('prefers the live name over a stored one', async () => {
    mockApiFetch.mockResolvedValue({ id: PLAYLIST_ID, name: 'DJ German Indie' });

    const { result } = renderHook(
      () => usePlaylistName('spotify', PLAYLIST_ID, '4hu6d8wg2TwtAbCdEfGh...'),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toBe('DJ German Indie'));
  });

  it('falls back to the stored name, then a shortened ID', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { result: stored } = renderHook(() => usePlaylistName('spotify', PLAYLIST_ID, 'Saved Name'), { wrapper });
    const { result: bare } = renderHook(() => usePlaylistName('spotify', PLAYLIST_ID), { wrapper });

    expect(stored.current).toBe('Saved Name');
    expect(bare.current).toBe('4hu6d8wg2TwtAbCdEfGh...');
  });
});
