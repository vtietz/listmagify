'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2, Music } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';
import type { SearchArtistResult, ArtistSearchResult, MusicProviderId } from '@/lib/music-provider/types';

interface ArtistResultsListProps {
  debouncedQuery: string;
  providerId: MusicProviderId;
  isActive: boolean;
}

export function ArtistResultsList({ debouncedQuery, providerId, isActive }: ArtistResultsListProps) {
  const setDrillDown = useBrowsePanelStore((s) => s.setDrillDown);

  const { data, isLoading, isError } = useInfiniteQuery({
    queryKey: ['browse-search-artists', providerId, debouncedQuery],
    queryFn: async ({ pageParam }: { pageParam: number }): Promise<ArtistSearchResult> => {
      if (!debouncedQuery.trim()) {
        return { artists: [], total: 0, nextOffset: null };
      }
      return apiFetch<ArtistSearchResult>(
        `/api/search/artists?q=${encodeURIComponent(debouncedQuery)}&limit=20&offset=${pageParam}&provider=${providerId}`
      );
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage: ArtistSearchResult) => lastPage.nextOffset,
    enabled: isActive && debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const artists = data?.pages.flatMap((p) => p.artists) ?? [];

  if (isLoading && debouncedQuery) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <div className="flex items-center justify-center h-32 text-sm text-destructive">Failed to search artists.</div>;
  }

  if (!debouncedQuery) {
    return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Enter a search term to find artists</div>;
  }

  if (artists.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No artists found for &quot;{debouncedQuery}&quot;
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {artists.map((artist) => (
        <ArtistRow
          key={artist.id}
          artist={artist}
          onClick={() => setDrillDown({ type: 'artist', id: artist.id, name: artist.name, image: artist.image })}
        />
      ))}
    </div>
  );
}

function ArtistRow({ artist, onClick }: { artist: SearchArtistResult; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 w-full px-3 py-2 hover:bg-accent/50 transition-colors text-left"
      onClick={onClick}
    >
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {artist.image ? (
          <img src={artist.image.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <span className="text-sm truncate">{artist.name}</span>
    </button>
  );
}
