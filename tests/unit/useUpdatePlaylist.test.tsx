import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdatePlaylist } from '@/lib/spotify/mutations/useUpdatePlaylist';
import { apiFetch } from '@/lib/api/client';
import { eventBus } from '@/lib/sync/eventBus';
import { toast } from '@/lib/ui/toast';
import { playlistMeta, userPlaylists } from '@/lib/api/queryKeys';
import type { Playlist } from '@/lib/music-provider/types';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/sync/eventBus', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockEmit = vi.mocked(eventBus.emit);
const mockToastError = vi.mocked(toast.error);

type PlaylistMetaData = {
  id: string;
  name: string;
  description: string;
  owner: { id: string; displayName: string };
  collaborative: boolean;
  tracksTotal: number;
  isPublic: boolean;
};

type PlaylistsPage = {
  items: Playlist[];
  nextCursor: string | null;
  total: number;
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

describe('useUpdatePlaylist', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('optimistically updates metadata and playlists cache immediately', async () => {
    const playlistId = 'test-playlist-1';
    const originalMeta: PlaylistMetaData = {
      id: playlistId,
      name: 'Original Name',
      description: 'Original Description',
      owner: { id: 'owner-1', displayName: 'Owner' },
      collaborative: false,
      tracksTotal: 5,
      isPublic: false,
    };

    const playlistsData: InfiniteData<PlaylistsPage> = {
      pages: [
        {
          items: [
            { id: playlistId, name: 'Original Name', description: 'Original Description', tracksTotal: 5, isPublic: false },
            { id: 'other', name: 'Other Playlist', tracksTotal: 10 },
          ],
          nextCursor: null,
          total: 2,
        },
      ],
      pageParams: [null],
    };

    queryClient.setQueryData(playlistMeta(playlistId), originalMeta);
    queryClient.setQueryData(userPlaylists(), playlistsData);

    let resolveRequest: ((value: { success: boolean }) => void) | undefined;
    mockApiFetch.mockReturnValueOnce(
      new Promise<{ success: boolean }>((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { result } = renderHook(() => useUpdatePlaylist(), { wrapper });

    act(() => {
      result.current.mutate({
        playlistId,
        name: 'Renamed Playlist',
        description: 'Updated Description',
        isPublic: true,
      });
    });

    await waitFor(() => {
      const optimisticMeta = queryClient.getQueryData<PlaylistMetaData>(playlistMeta(playlistId));
      expect(optimisticMeta?.name).toBe('Renamed Playlist');
      expect(optimisticMeta?.description).toBe('Updated Description');
      expect(optimisticMeta?.isPublic).toBe(true);
    });

    await waitFor(() => {
      const optimisticPlaylists = queryClient.getQueryData<InfiniteData<PlaylistsPage>>(userPlaylists());
      expect(optimisticPlaylists?.pages[0]?.items[0]?.name).toBe('Renamed Playlist');
      expect(optimisticPlaylists?.pages[0]?.items[0]?.description).toBe('Updated Description');
      expect(optimisticPlaylists?.pages[0]?.items[0]?.isPublic).toBe(true);
    });

    await act(async () => {
      resolveRequest?.({ success: true });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockEmit).toHaveBeenCalledWith('playlist:update', {
      playlistId,
      cause: 'metadata',
      providerId: 'spotify',
    });
  });

  it('rolls back optimistic updates when mutation fails', async () => {
    const playlistId = 'test-playlist-1';
    const originalMeta: PlaylistMetaData = {
      id: playlistId,
      name: 'Original Name',
      description: 'Original Description',
      owner: { id: 'owner-1', displayName: 'Owner' },
      collaborative: false,
      tracksTotal: 5,
      isPublic: false,
    };

    const playlistsData: InfiniteData<PlaylistsPage> = {
      pages: [
        {
          items: [
            { id: playlistId, name: 'Original Name', description: 'Original Description', tracksTotal: 5, isPublic: false },
          ],
          nextCursor: null,
          total: 1,
        },
      ],
      pageParams: [null],
    };

    queryClient.setQueryData(playlistMeta(playlistId), originalMeta);
    queryClient.setQueryData(userPlaylists(), playlistsData);

    mockApiFetch.mockRejectedValueOnce(new Error('Update failed'));

    const { result } = renderHook(() => useUpdatePlaylist(), { wrapper });

    act(() => {
      result.current.mutate({
        playlistId,
        name: 'Should Roll Back',
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const rolledBackMeta = queryClient.getQueryData<PlaylistMetaData>(playlistMeta(playlistId));
    expect(rolledBackMeta?.name).toBe('Original Name');

    const rolledBackPlaylists = queryClient.getQueryData<InfiniteData<PlaylistsPage>>(userPlaylists());
    expect(rolledBackPlaylists?.pages[0]?.items[0]?.name).toBe('Original Name');

    expect(mockToastError).toHaveBeenCalledWith('Update failed');
    expect(mockEmit).not.toHaveBeenCalled();
  });
});