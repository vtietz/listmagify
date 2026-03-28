'use client';

import Image from 'next/image';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { Loader2, Disc3 } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { useBrowsePanelStore } from '@features/split-editor/browse/hooks/useBrowsePanelStore';
import type { SearchAlbumResult, AlbumSearchResult, MusicProviderId } from '@/lib/music-provider/types';

interface AlbumResultsListProps {
  debouncedQuery: string;
  providerId: MusicProviderId;
  isActive: boolean;
}

export function AlbumResultsList({ debouncedQuery, providerId, isActive }: AlbumResultsListProps) {
  const setDrillDown = useBrowsePanelStore((s) => s.setDrillDown);

  const { data, isLoading, isFetching, isError } = useInfiniteQuery({
    queryKey: ['browse-search-albums', providerId, debouncedQuery],
    queryFn: async ({ pageParam }: { pageParam: number }): Promise<AlbumSearchResult> => {
      if (!debouncedQuery.trim()) {
        return { albums: [], total: 0, nextOffset: null };
      }
      return apiFetch<AlbumSearchResult>(
        `/api/search/albums?q=${encodeURIComponent(debouncedQuery)}&limit=20&offset=${pageParam}&provider=${providerId}`
      );
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage: AlbumSearchResult) => lastPage.nextOffset,
    enabled: isActive && debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000,
    // Keep previous results visible while new search query loads to prevent flickering
    ...(debouncedQuery.trim()
      ? { placeholderData: (prev: InfiniteData<AlbumSearchResult> | undefined) => prev }
      : {}),
  });

  const albums = data?.pages.flatMap((p) => p.albums) ?? [];

  if (isLoading && debouncedQuery) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <div className="flex items-center justify-center h-32 text-sm text-destructive">Failed to search albums.</div>;
  }

  if (!debouncedQuery) {
    return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Enter a search term to find albums</div>;
  }

  if (albums.length === 0 && !isFetching) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No albums found for &quot;{debouncedQuery}&quot;
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {albums.map((album) => (
        <AlbumRow
          key={album.id}
          album={album}
          onClick={() => setDrillDown({ type: 'album', id: album.id, name: album.name, image: album.image })}
        />
      ))}
    </div>
  );
}

function AlbumRow({ album, onClick }: { album: SearchAlbumResult; onClick: () => void }) {
  const year = album.releaseDate ? album.releaseDate.slice(0, 4) : null;

  return (
    <button
      type="button"
      className="flex items-center gap-3 w-full px-3 py-2 hover:bg-accent/50 transition-colors text-left"
      onClick={onClick}
    >
      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {album.image ? (
          <Image
            src={album.image.url}
            alt=""
            width={36}
            height={36}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <Disc3 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{album.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {album.artistName}{year ? ` \u00b7 ${year}` : ''}
        </div>
      </div>
    </button>
  );
}
