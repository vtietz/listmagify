/**
 * useLastfmTracks - Hook for fetching Last.fm tracks with infinite scroll
 *
 * Features:
 * - Infinite query with pagination
 * - Track normalization with global indices
 * - Provider matching integration
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { useLastfmMatch, type CachedMatch } from './useLastfmMatchCache';
import type { ImportedTrackDTO, ImportSource, LastfmPeriod } from '@/lib/importers/types';
import type { Track } from '@/lib/music-provider/types';

type TrackAlbum = Exclude<Track['album'], undefined>;

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
  _isMatched: boolean;
}

function mapMatchedTrackAlbum(dto: IndexedTrackDTO, matched: NonNullable<CachedMatch['matchedTrack']>): TrackAlbum {
  if (matched.album?.name) {
    return { id: matched.album.id ?? null, name: matched.album.name };
  }

  if (dto.albumName) {
    return { name: dto.albumName };
  }

  return null;
}

function buildMatchedLastfmTrack(dto: IndexedTrackDTO, matched: NonNullable<CachedMatch['matchedTrack']>): LastfmTrack {
  const artists = matched.artists.length > 0 ? matched.artists : [dto.artistName];

  return {
    id: matched.id,
    uri: matched.uri,
    name: matched.name,
    artists,
    artistObjects: artists.map((name) => ({ id: null, name })),
    durationMs: matched.durationMs ?? 0,
    position: dto.globalIndex,
    album: mapMatchedTrackAlbum(dto, matched),
    popularity: matched.popularity ?? null,
    _lastfmDto: dto,
    _isMatched: true,
  };
}

function buildUnmatchedLastfmTrack(dto: IndexedTrackDTO): LastfmTrack {
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
    _isMatched: false,
  };
}

/**
 * Convert a Last.fm track to provider track format for display
 * Uses matched provider data when available, otherwise shows Last.fm info as placeholder
 */
export function lastfmToTrack(
  dto: IndexedTrackDTO,
  cachedMatch: CachedMatch | undefined
): LastfmTrack {
  const matched = cachedMatch?.matchedTrack ?? cachedMatch?.spotifyTrack;

  if (matched) {
    return buildMatchedLastfmTrack(dto, matched);
  }

  return buildUnmatchedLastfmTrack(dto);
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
  const { getCachedMatch } = useLastfmMatch();

  // Infinite query for Last.fm tracks
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
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Flatten pages into indexed track DTOs
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

  // Convert to Track format with match status
  const allTracks: LastfmTrack[] = useMemo(() => {
    return allLastfmTracks.map((dto) => {
      const cached = getCachedMatch(dto);
      return lastfmToTrack(dto, cached);
    });
  }, [allLastfmTracks, getCachedMatch]);

  // Track URIs for playback (only matched tracks)
  const trackUris = useMemo(
    () =>
      allTracks
        .filter((t) => t._isMatched && t.uri && !t.uri.startsWith('lastfm:'))
        .map((t) => t.uri),
    [allTracks]
  );

  const totalResults = query.data?.pages[0]?.pagination?.totalItems ?? allTracks.length;

  return {
    ...query,
    allLastfmTracks,
    allTracks,
    trackUris,
    totalResults,
  };
}
