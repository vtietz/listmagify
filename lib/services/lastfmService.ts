import { z } from 'zod';
import { routeErrors } from '@/lib/errors';
import {
  fetchLovedTracks,
  fetchRecentTracks,
  fetchTopTracks,
  fetchWeeklyChart,
  isLastfmAvailable,
} from '@/lib/importers/lastfm';
import type {
  LastfmPeriod,
} from '@/lib/importers/types';

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

export function mapLastfmError(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Internal server error';
  if (message.includes('Rate limit') || message.includes('error 29')) {
    throw routeErrors.rateLimit('Rate limit exceeded. Please try again later.');
  }
  throw routeErrors.upstreamFailure(message);
}
