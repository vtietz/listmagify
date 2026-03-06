import { z } from 'zod';
import { routeErrors } from '@/lib/errors';
import {
  fetchLovedTracks,
  fetchRecentTracks,
  fetchTopTracks,
  fetchWeeklyChart,
  isLastfmAvailable,
} from '@/lib/importers/lastfm';
import {
  buildFallbackQuery,
  buildSearchQuery,
  createMatchResult,
} from '@/lib/importers/spotifyMatcher';
import type {
  ImportedTrackDTO,
  LastfmPeriod,
  MatchResult,
  SpotifyMatchedTrack,
} from '@/lib/importers/types';
import { getMusicProvider } from '@/lib/music-provider';
import { mapPlaylistItemToTrack } from '@/lib/spotify/types';

const lastfmBaseSchema = z.object({
  user: z.string().trim().min(1, 'Username is required').transform((value) => value.toLowerCase()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(25).max(100).default(50),
});

const periodSchema = z.enum(['overall', '7day', '1month', '3month', '6month', '12month']);

export function assertLastfmAvailable(): void {
  if (!isLastfmAvailable()) {
    throw routeErrors.featureDisabled('Last.fm import is not enabled');
  }
}

export function parseLastfmBaseQuery(searchParams: URLSearchParams): {
  username: string;
  page: number;
  limit: number;
} {
  const parsed = lastfmBaseSchema.safeParse({
    user: searchParams.get('user') ?? '',
    page: searchParams.get('page') ?? '1',
    limit: searchParams.get('limit') ?? '50',
  });

  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  return {
    username: parsed.data.user,
    page: parsed.data.page,
    limit: parsed.data.limit,
  };
}

export function parseLastfmPeriod(searchParams: URLSearchParams): LastfmPeriod {
  const parsed = periodSchema.safeParse(searchParams.get('period') ?? 'overall');
  return parsed.success ? parsed.data : 'overall';
}

export function parseLastfmWeekRange(searchParams: URLSearchParams): {
  from?: number;
  to?: number;
} {
  const fromValue = searchParams.get('from');
  const toValue = searchParams.get('to');

  const from = fromValue ? Number.parseInt(fromValue, 10) : undefined;
  const to = toValue ? Number.parseInt(toValue, 10) : undefined;

  return {
    ...(typeof from === 'number' && Number.isFinite(from) ? { from } : {}),
    ...(typeof to === 'number' && Number.isFinite(to) ? { to } : {}),
  };
}

export async function getRecentTracks(searchParams: URLSearchParams) {
  const { username, page, limit } = parseLastfmBaseQuery(searchParams);
  return fetchRecentTracks({ username, page, limit });
}

export async function getLovedTracks(searchParams: URLSearchParams) {
  const { username, page, limit } = parseLastfmBaseQuery(searchParams);
  return fetchLovedTracks({ username, page, limit });
}

export async function getTopTracks(searchParams: URLSearchParams) {
  const { username, page, limit } = parseLastfmBaseQuery(searchParams);
  const period = parseLastfmPeriod(searchParams);
  const result = await fetchTopTracks({ username, page, limit, period });
  return { period, result };
}

export async function getWeeklyTracks(searchParams: URLSearchParams) {
  const { username } = parseLastfmBaseQuery(searchParams);
  const range = parseLastfmWeekRange(searchParams);
  return fetchWeeklyChart({ username, ...range });
}

interface MatchRequest {
  tracks: ImportedTrackDTO[];
  limit?: number;
}

export function parseMatchRequest(payload: unknown): { tracks: ImportedTrackDTO[]; limit: number } {
  const parsed = z
    .object({
      tracks: z.array(
        z.object({
          artistName: z.string(),
          trackName: z.string(),
          albumName: z.string().optional(),
          mbid: z.string().optional(),
          playedAt: z.number().optional(),
          playcount: z.number().optional(),
          sourceUrl: z.string().optional(),
          nowPlaying: z.boolean().optional(),
        })
      ).min(1, 'Tracks array is required'),
      limit: z.coerce.number().int().min(1).max(10).default(5),
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid match payload');
  }

  const tracks: ImportedTrackDTO[] = parsed.data.tracks.map((track) => ({
    artistName: track.artistName,
    trackName: track.trackName,
    ...(track.albumName ? { albumName: track.albumName } : {}),
    ...(track.mbid ? { mbid: track.mbid } : {}),
    ...(typeof track.playedAt === 'number' ? { playedAt: track.playedAt } : {}),
    ...(typeof track.playcount === 'number' ? { playcount: track.playcount } : {}),
    ...(track.sourceUrl ? { sourceUrl: track.sourceUrl } : {}),
    ...(typeof track.nowPlaying === 'boolean' ? { nowPlaying: track.nowPlaying } : {}),
  }));

  return {
    tracks,
    limit: parsed.data.limit,
  };
}

async function searchSpotify(query: string, limit: number): Promise<SpotifyMatchedTrack[]> {
  const provider = getMusicProvider('spotify');
  const spotifyUrl = `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const response = await provider.fetch(spotifyUrl);

  if (!response.ok) {
    const message = await response.text().catch(() => 'Search failed');
    throw routeErrors.upstreamFailure(`Search failed: ${response.status}`, message);
  }

  const data = (await response.json()) as { tracks?: { items?: unknown[] } };
  const items = data.tracks?.items ?? [];

  return items.map((item) => {
    const track = mapPlaylistItemToTrack({ track: item });
    return {
      id: track.id || '',
      uri: track.uri,
      name: track.name,
      artists: track.artists,
      album: track.album
        ? {
            id: track.album.id,
            name: track.album.name,
          }
        : undefined,
      durationMs: track.durationMs,
      popularity: track.popularity || undefined,
    } as SpotifyMatchedTrack;
  });
}

async function matchSingleTrack(track: ImportedTrackDTO, limit: number): Promise<MatchResult> {
  const exact = await searchSpotify(buildSearchQuery(track, true), limit);
  if (exact.length > 0) {
    return createMatchResult(track, exact);
  }

  const relaxed = await searchSpotify(buildSearchQuery(track, false), limit);
  if (relaxed.length > 0) {
    return createMatchResult(track, relaxed);
  }

  const fallback = await searchSpotify(buildFallbackQuery(track), limit);
  return createMatchResult(track, fallback);
}

export async function matchTracks(payload: MatchRequest): Promise<{ results: MatchResult[]; matched: number; total: number }> {
  const { tracks, limit } = parseMatchRequest(payload);
  const tracksToMatch = tracks.slice(0, 20);

  const results = await Promise.all(
    tracksToMatch.map(async (track) => {
      try {
        return await matchSingleTrack(track, limit);
      } catch {
        return {
          imported: track,
          confidence: 'none',
          score: 0,
        } as MatchResult;
      }
    })
  );

  return {
    results,
    matched: results.filter((result) => result.confidence !== 'none').length,
    total: results.length,
  };
}

export function mapLastfmError(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Internal server error';
  if (message.includes('Rate limit') || message.includes('error 29')) {
    throw routeErrors.rateLimit('Rate limit exceeded. Please try again later.');
  }
  throw routeErrors.upstreamFailure(message);
}