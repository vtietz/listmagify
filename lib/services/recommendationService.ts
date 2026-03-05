import { z } from 'zod';
import { routeErrors } from '@/lib/errors';
import { fetchTracks } from '@/lib/spotify/catalog';
import {
  getPlaylistAppendixRecommendations,
  getSeedRecommendations,
  type RecommendationContext,
} from '@/lib/recs';
import type { Recommendation } from '@/lib/recs/score';

const seedSchema = z.object({
  seedTrackIds: z.array(z.string()).min(1).max(5),
  excludeTrackIds: z.array(z.string()).default([]),
  playlistId: z.string().optional(),
  topN: z.coerce.number().int().min(1).max(50).default(20),
  includeMetadata: z.boolean().default(true),
});

const appendixSchema = z.object({
  playlistId: z.string().min(1),
  trackIds: z.array(z.string()).min(1),
  topN: z.coerce.number().int().min(1).max(50).default(20),
  includeMetadata: z.boolean().default(true),
});

export function parseSeedRequest(payload: unknown) {
  const parsed = seedSchema.safeParse(payload);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid seed request payload');
  }
  return parsed.data;
}

export function parseAppendixRequest(payload: unknown) {
  const parsed = appendixSchema.safeParse(payload);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid appendix request payload');
  }
  return parsed.data;
}

async function attachTrackMetadata(recommendations: Recommendation[]) {
  if (recommendations.length === 0) {
    return recommendations;
  }

  const tracks = await fetchTracks(recommendations.map((recommendation) => recommendation.trackId));
  const trackMap = new Map(tracks.map((track) => [track.id, track]));

  for (const recommendation of recommendations) {
    const track = trackMap.get(recommendation.trackId);
    if (track) {
      recommendation.track = track;
    }
  }

  return recommendations;
}

export async function getSeedRecs(payload: unknown) {
  const parsed = parseSeedRequest(payload);
  const context: RecommendationContext = {
    excludeTrackIds: new Set(parsed.excludeTrackIds),
    ...(parsed.playlistId ? { playlistId: parsed.playlistId } : {}),
    topN: parsed.topN,
  };

  const recommendations = getSeedRecommendations(parsed.seedTrackIds, context);
  if (parsed.includeMetadata) {
    await attachTrackMetadata(recommendations);
  }

  return recommendations;
}

export async function getAppendixRecs(payload: unknown) {
  const parsed = parseAppendixRequest(payload);
  const context: RecommendationContext = {
    excludeTrackIds: new Set(parsed.trackIds),
    playlistId: parsed.playlistId,
    topN: parsed.topN,
  };

  const recommendations = getPlaylistAppendixRecommendations(parsed.trackIds, context);
  if (parsed.includeMetadata) {
    await attachTrackMetadata(recommendations);
  }

  return recommendations;
}