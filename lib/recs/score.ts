/**
 * Recommendation scoring and retrieval module.
 * 
 * Implements two recommendation modes:
 * - Mode A: Seed-based recommendations (for selected tracks)
 * - Mode B: Playlist appendix recommendations (for entire playlist)
 * 
 * Scoring blends multiple signals: adjacency, co-occurrence, catalog, and optionally vectors.
 */

import { getRecsDb, unixNow } from "./db";
import { scoringWeights, recsParams } from "./env";
import { getAdjacencyEdgesFrom, getCooccurrenceNeighbors } from "./edges";
import { getCatalogEdges, getTrackPopularities, getAlbumAdjacency } from "./catalog";
import type { Track } from "@/lib/spotify/types";

/**
 * A candidate recommendation with accumulated scores.
 */
export interface RecommendationCandidate {
  trackId: string;
  scores: {
    adjacency: number;
    cooccurrence: number;
    artistTop: number;
    albumAdj: number;
    relatedArtist: number;
    popularity: number;
    vector?: number;
  };
  totalScore: number;
  sources: Set<string>; // Which sources contributed this candidate
}

/**
 * Final recommendation output.
 */
export interface Recommendation {
  trackId: string;
  score: number;
  rank: number;
  track?: Track; // Populated if track metadata is available
}

/**
 * Context for generating recommendations.
 */
export interface RecommendationContext {
  /** Track IDs to exclude from results (e.g., already in playlist) */
  excludeTrackIds: Set<string>;
  
  /** Session-level dismissed recommendations */
  dismissedTrackIds?: Set<string>;
  
  /** Playlist ID for context-specific dismissals */
  playlistId?: string;
  
  /** Maximum results to return */
  topN?: number;
  
  /** Minimum score threshold */
  minScore?: number;
}

// ============================================================================
// MODE A: SEED-BASED RECOMMENDATIONS
// ============================================================================

/**
 * Get recommendations based on selected seed tracks.
 * 
 * @param seedTrackIds - Array of seed track IDs
 * @param context - Recommendation context (exclusions, limits)
 */
export function getSeedRecommendations(
  seedTrackIds: string[],
  context: RecommendationContext
): Recommendation[] {
  if (seedTrackIds.length === 0) {
    return [];
  }
  
  const topN = context.topN ?? recsParams.defaultTopN;
  const minScore = context.minScore ?? recsParams.minScoreThreshold;
  
  // Collect candidates from all sources
  const candidateMap = new Map<string, RecommendationCandidate>();
  
  for (const seedId of seedTrackIds) {
    // 1. Graph adjacency edges
    const adjacencyEdges = getAdjacencyEdgesFrom(seedId, recsParams.candidatesPerSeed);
    for (const edge of adjacencyEdges) {
      mergeCandidateScore(candidateMap, edge.toTrackId, 'adjacency', edge.weight, 'adjacency');
    }
    
    // 2. Co-occurrence neighbors
    const cooccurNeighbors = getCooccurrenceNeighbors(seedId, recsParams.maxCooccurrenceNeighbors);
    for (const neighbor of cooccurNeighbors) {
      mergeCandidateScore(candidateMap, neighbor.neighborId, 'cooccurrence', neighbor.weight, 'cooccurrence');
    }
    
    // 3. Catalog edges (artist top tracks)
    const artistTopEdges = getCatalogEdges(seedId, 'artist_top', 20);
    for (const edge of artistTopEdges) {
      mergeCandidateScore(candidateMap, edge.toTrackId, 'artistTop', edge.weight, 'artist_top');
    }
    
    // 4. Album adjacency
    const albumAdj = getAlbumAdjacency(seedId);
    if (albumAdj) {
      if (albumAdj.nextTrackId) {
        mergeCandidateScore(candidateMap, albumAdj.nextTrackId, 'albumAdj', 1.0, 'album_adj');
      }
      if (albumAdj.prevTrackId) {
        mergeCandidateScore(candidateMap, albumAdj.prevTrackId, 'albumAdj', 0.8, 'album_adj');
      }
    }
    
    // 5. Related artist edges (if data exists)
    const relatedEdges = getCatalogEdges(seedId, 'related_artist_top', 10);
    for (const edge of relatedEdges) {
      mergeCandidateScore(candidateMap, edge.toTrackId, 'relatedArtist', edge.weight, 'related_artist');
    }
  }
  
  // Add popularity scores
  addPopularityScores(candidateMap);
  
  // Filter excluded tracks
  const filteredCandidates = filterExcluded(candidateMap, context);
  
  // Compute final scores
  const scoredCandidates = computeFinalScores(filteredCandidates);
  
  // Sort and return top N
  const sorted = scoredCandidates
    .filter(c => c.totalScore >= minScore)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, topN);
  
  return sorted.map((c, idx) => ({
    trackId: c.trackId,
    score: c.totalScore,
    rank: idx + 1,
  }));
}

// ============================================================================
// MODE B: PLAYLIST APPENDIX RECOMMENDATIONS
// ============================================================================

/**
 * Get recommendations to append to a playlist.
 * Considers the entire playlist, with emphasis on recent tracks for flow.
 * 
 * @param playlistTrackIds - All track IDs in the playlist (ordered)
 * @param context - Recommendation context
 */
export function getPlaylistAppendixRecommendations(
  playlistTrackIds: string[],
  context: RecommendationContext
): Recommendation[] {
  if (playlistTrackIds.length === 0) {
    return [];
  }
  
  const topN = context.topN ?? recsParams.defaultTopN;
  const minScore = context.minScore ?? recsParams.minScoreThreshold;
  
  const candidateMap = new Map<string, RecommendationCandidate>();
  
  // Weight tracks by position (recent tracks have more weight for appendix)
  const numTracks = playlistTrackIds.length;
  
  // Sample tracks throughout the playlist, with higher density at the end
  const sampledIndices = getSampledIndices(numTracks, 20);
  
  for (const idx of sampledIndices) {
    const trackId = playlistTrackIds[idx];
    if (!trackId) continue;
    
    // Weight based on position (last track = 1.0, first = 0.3)
    const positionWeight = 0.3 + 0.7 * (idx / (numTracks - 1 || 1));
    
    // 1. Adjacency edges (especially important for tail)
    const adjacencyEdges = getAdjacencyEdgesFrom(trackId, 30);
    for (const edge of adjacencyEdges) {
      mergeCandidateScore(
        candidateMap, 
        edge.toTrackId, 
        'adjacency', 
        edge.weight * positionWeight,
        'adjacency'
      );
    }
    
    // 2. Co-occurrence (uniform weight)
    const cooccurNeighbors = getCooccurrenceNeighbors(trackId, 30);
    for (const neighbor of cooccurNeighbors) {
      mergeCandidateScore(
        candidateMap, 
        neighbor.neighborId, 
        'cooccurrence', 
        neighbor.weight * 0.5, // Lower weight for playlist mode
        'cooccurrence'
      );
    }
    
    // 3. Artist top tracks (for variety)
    const artistTopEdges = getCatalogEdges(trackId, 'artist_top', 10);
    for (const edge of artistTopEdges) {
      mergeCandidateScore(
        candidateMap, 
        edge.toTrackId, 
        'artistTop', 
        edge.weight * positionWeight,
        'artist_top'
      );
    }
  }
  
  // 4. Album adjacency for tail continuity
  const tailTracks = playlistTrackIds.slice(-3);
  for (const trackId of tailTracks) {
    const albumAdj = getAlbumAdjacency(trackId);
    if (albumAdj?.nextTrackId) {
      // High weight for continuing an album at the end
      mergeCandidateScore(candidateMap, albumAdj.nextTrackId, 'albumAdj', 1.5, 'album_adj');
    }
  }
  
  // Add popularity scores
  addPopularityScores(candidateMap);
  
  // Filter excluded tracks
  const filteredCandidates = filterExcluded(candidateMap, context);
  
  // Compute final scores
  const scoredCandidates = computeFinalScores(filteredCandidates);
  
  // Sort and return top N
  const sorted = scoredCandidates
    .filter(c => c.totalScore >= minScore)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, topN);
  
  return sorted.map((c, idx) => ({
    trackId: c.trackId,
    score: c.totalScore,
    rank: idx + 1,
  }));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Merge a score into a candidate's accumulator.
 */
function mergeCandidateScore(
  map: Map<string, RecommendationCandidate>,
  trackId: string,
  scoreKey: keyof RecommendationCandidate['scores'],
  value: number,
  source: string
): void {
  let candidate = map.get(trackId);
  
  if (!candidate) {
    candidate = {
      trackId,
      scores: {
        adjacency: 0,
        cooccurrence: 0,
        artistTop: 0,
        albumAdj: 0,
        relatedArtist: 0,
        popularity: 0,
      },
      totalScore: 0,
      sources: new Set(),
    };
    map.set(trackId, candidate);
  }
  
  // Accumulate the score (some sources may contribute multiple times)
  candidate.scores[scoreKey] += value;
  candidate.sources.add(source);
}

/**
 * Add popularity scores to all candidates.
 */
function addPopularityScores(candidateMap: Map<string, RecommendationCandidate>): void {
  const trackIds = Array.from(candidateMap.keys());
  const popularities = getTrackPopularities(trackIds);
  
  for (const [trackId, candidate] of candidateMap) {
    const popularity = popularities.get(trackId);
    if (popularity !== undefined) {
      // Normalize to 0-1
      candidate.scores.popularity = popularity / 100;
      candidate.sources.add('popularity');
    }
  }
}

/**
 * Filter out excluded tracks from candidates.
 */
export function filterExcluded(
  candidateMap: Map<string, RecommendationCandidate>,
  context: RecommendationContext
): RecommendationCandidate[] {
  const db = getRecsDb();
  
  // Get dismissed tracks for this context
  let dismissedIds = context.dismissedTrackIds ?? new Set<string>();
  
  if (context.playlistId) {
    // Also check persistent dismissals
    const persistentDismissed = db.prepare(`
      SELECT track_id FROM dismissed_recommendations 
      WHERE context_id IN (?, 'global')
    `).all(context.playlistId) as Array<{ track_id: string }>;
    
    for (const row of persistentDismissed) {
      dismissedIds = new Set([...dismissedIds, row.track_id]);
    }
  }
  
  const results: RecommendationCandidate[] = [];
  
  for (const [trackId, candidate] of candidateMap) {
    // Skip if in exclude set (e.g., already in playlist)
    if (context.excludeTrackIds.has(trackId)) {
      continue;
    }
    
    // Skip if dismissed
    if (dismissedIds.has(trackId)) {
      continue;
    }
    
    results.push(candidate);
  }
  
  return results;
}

/**
 * Compute final blended scores for all candidates.
 */
function computeFinalScores(
  candidates: RecommendationCandidate[]
): RecommendationCandidate[] {
  // Normalize scores across all candidates
  const maxScores = {
    adjacency: 0,
    cooccurrence: 0,
    artistTop: 0,
    albumAdj: 0,
    relatedArtist: 0,
    popularity: 1, // Already 0-1
  };
  
  for (const c of candidates) {
    maxScores.adjacency = Math.max(maxScores.adjacency, c.scores.adjacency);
    maxScores.cooccurrence = Math.max(maxScores.cooccurrence, c.scores.cooccurrence);
    maxScores.artistTop = Math.max(maxScores.artistTop, c.scores.artistTop);
    maxScores.albumAdj = Math.max(maxScores.albumAdj, c.scores.albumAdj);
    maxScores.relatedArtist = Math.max(maxScores.relatedArtist, c.scores.relatedArtist);
  }
  
  // Avoid division by zero
  for (const key of Object.keys(maxScores) as (keyof typeof maxScores)[]) {
    if (maxScores[key] === 0) maxScores[key] = 1;
  }
  
  // Compute weighted sum
  for (const c of candidates) {
    const normalizedScores = {
      adjacency: c.scores.adjacency / maxScores.adjacency,
      cooccurrence: c.scores.cooccurrence / maxScores.cooccurrence,
      artistTop: c.scores.artistTop / maxScores.artistTop,
      albumAdj: c.scores.albumAdj / maxScores.albumAdj,
      relatedArtist: c.scores.relatedArtist / maxScores.relatedArtist,
      popularity: c.scores.popularity,
    };
    
    c.totalScore = 
      scoringWeights.adjacency * normalizedScores.adjacency +
      scoringWeights.coMembership * normalizedScores.cooccurrence +
      scoringWeights.catalog.artistOverlap * normalizedScores.artistTop +
      scoringWeights.catalog.albumContinuity * normalizedScores.albumAdj +
      scoringWeights.catalog.relatedArtist * normalizedScores.relatedArtist +
      scoringWeights.catalog.popularity * normalizedScores.popularity;
      
    // Diversity bonus: tracks from multiple sources score higher
    const sourceBonus = (c.sources.size - 1) * 0.05;
    c.totalScore += sourceBonus;
  }
  
  return candidates;
}

/**
 * Get sampled indices with higher density at the end.
 */
function getSampledIndices(total: number, maxSamples: number): number[] {
  if (total <= maxSamples) {
    return Array.from({ length: total }, (_, i) => i);
  }
  
  const indices: number[] = [];
  
  // Always include last 5 tracks
  const tailCount = Math.min(5, total);
  for (let i = total - tailCount; i < total; i++) {
    indices.push(i);
  }
  
  // Sample remaining from rest of playlist
  const remaining = maxSamples - tailCount;
  const bodyLength = total - tailCount;
  const step = Math.floor(bodyLength / remaining);
  
  for (let i = 0; i < bodyLength && indices.length < maxSamples; i += step) {
    if (!indices.includes(i)) {
      indices.push(i);
    }
  }
  
  return indices.sort((a, b) => a - b);
}

// ============================================================================
// DISMISSAL MANAGEMENT
// ============================================================================

/**
 * Dismiss a recommendation for a context.
 * 
 * @param trackId - Track ID to dismiss
 * @param contextId - Playlist ID or 'global'
 */
export function dismissRecommendation(trackId: string, contextId: string = 'global'): void {
  const db = getRecsDb();
  const now = unixNow();
  
  db.prepare(`
    INSERT INTO dismissed_recommendations (context_id, track_id, dismissed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(context_id, track_id) DO UPDATE SET dismissed_at = excluded.dismissed_at
  `).run(contextId, trackId, now);
}

/**
 * Clear dismissals for a context.
 * 
 * @param contextId - Playlist ID or 'global'
 */
export function clearDismissals(contextId: string): void {
  const db = getRecsDb();
  db.prepare(`DELETE FROM dismissed_recommendations WHERE context_id = ?`).run(contextId);
}
