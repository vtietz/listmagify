/**
 * useLastfmTracks - Hook for fetching Last.fm tracks with infinite scroll
 *
 * Features:
 * - Infinite query with pagination
 * - Track normalization with global indices
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { TrackPayload } from '@features/dnd/model/types';
import type { ImportedTrackDTO, ImportSource, LastfmPeriod } from '@/lib/importers/types';
import type { Track } from '@/lib/music-provider/types';

interface LastfmResponse {
  enabled: boolean;
  tracks: ImportedTrackDTO[];
  pagination: {
    page: number;
    perPage: number;
    totalPages?: number;
    totalItems?: number;
  };
  source: ImportSource;
  period?: LastfmPeriod;
  error?: string;
}

/** Extended track DTO with global index for flattened infinite query pages */
export interface IndexedTrackDTO extends ImportedTrackDTO {
  globalIndex: number;
}

/** Extended Track type with Last.fm metadata for rendering */
export interface LastfmTrack extends Track {
  _lastfmDto: IndexedTrackDTO;
}

/**
 * Build a provider-agnostic TrackPayload from a Last.fm DTO.
 * Used for DnD drag data and pending match enqueue.
 */
export function lastfmDtoToTrackPayload(dto: ImportedTrackDTO): TrackPayload {
  return {
    title: dto.trackName,
    artists: [dto.artistName],
    normalizedArtists: [dto.artistName.trim().toLowerCase()],
    album: dto.albumName ?? null,
    durationSec: 0,
  };
}

/**
 * Convert a Last.fm DTO to a Track for display using raw Last.fm metadata.
 */
export function lastfmToTrack(dto: IndexedTrackDTO): LastfmTrack {
  return {
    id: null,
    uri: `lastfm:${dto.artistName}:${dto.trackName}`,
    name: dto.trackName,
    artists: [dto.artistName],
    artistObjects: [{ id: null, name: dto.artistName }],
    durationMs: 0,
    position: dto.globalIndex,
    album: dto.albumName ? { name: dto.albumName } : null,
    popularity: null,
    _lastfmDto: dto,
  };
}

interface UseLastfmTracksParams {
  username: string;
  source: ImportSource;
  period: LastfmPeriod;
  enabled?: boolean;
}

export function useLastfmTracks({
  username,
  source,
  period,
  enabled = true,
}: UseLastfmTracksParams) {
  const query = useInfiniteQuery<LastfmResponse, Error, {pages: LastfmResponse[]}, readonly unknown[], number>({
    queryKey: ['lastfm-browse', source, username, period],
    queryFn: async ({ pageParam }): Promise<LastfmResponse> => {
      if (!username.trim()) {
        return {
          enabled: true,
          tracks: [],
          pagination: { page: 1, perPage: 50 },
          source,
        };
      }

      const endpoint = source.replace('lastfm-', '');
      const params = new URLSearchParams({
        user: username.trim().toLowerCase(),
        page: String(pageParam),
        limit: '50',
      });

      if (source === 'lastfm-top') {
        params.set('period', period);
      }

      return apiFetch<LastfmResponse>(`/api/lastfm/${endpoint}?${params}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      if (totalPages && page < totalPages) {
        return page + 1;
      }
      return undefined;
    },
    enabled: enabled && !!username.trim(),
    staleTime: 2 * 60 * 1000,
  });

  const allLastfmTracks: IndexedTrackDTO[] = useMemo(() => {
    if (!query.data?.pages) return [];

    let globalIndex = 0;
    return query.data.pages.flatMap((page) =>
      page.tracks.map((track) => ({
        ...track,
        globalIndex: globalIndex++,
      }))
    );
  }, [query.data?.pages]);

  const allTracks: LastfmTrack[] = useMemo(() => {
    return allLastfmTracks.map((dto) => lastfmToTrack(dto));
  }, [allLastfmTracks]);

  const totalResults = query.data?.pages[0]?.pagination?.totalItems ?? allTracks.length;

  return {
    ...query,
    allLastfmTracks,
    allTracks,
    totalResults,
  };
}
