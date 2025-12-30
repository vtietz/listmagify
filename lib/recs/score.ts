/**
 * Recommendation scoring and retrieval module.
 * 
 * Implements two recommendation modes:
 * - Mode A: Seed-based recommendations (for selected tracks)
 * - Mode B: Playlist appendix recommendations (for entire playlist)
 * 
 * Scoring blends adjacency and co-occurrence signals from user behavior.
 */

import { getRecsDb, unixNow } from "./db";
import { scoringWeights, recsParams } from "./env";
import { getAdjacencyEdgesFrom, getCooccurrenceNeighbors } from "./edges";
import type { Track } from "@/lib/spotify/types";

/**
 * A candidate recommendation with accumulated scores.
 */
export interface RecommendationCandidate {
  trackId: string;
  scores: {
    adjacency: number;
    cooccurrence: number;
  };
  totalScore: number;
  sources: Set<string>; // Which signal sources contributed this candidate
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
    // 1. Graph adjacency edges (tracks that follow this track)
    const adjacencyEdges = getAdjacencyEdgesFrom(seedId, recsParams.candidatesPerSeed);
    for (const edge of adjacencyEdges) {
      mergeCandidateScore(candidateMap, edge.toTrackId, 'adjacency', edge.weight, 'adjacency');
    }
    
    // 2. Co-occurrence neighbors (tracks in same playlists)
    const cooccurNeighbors = getCooccurrenceNeighbors(seedId, recsParams.maxCooccurrenceNeighbors);
    for (const neighbor of cooccurNeighbors) {
      mergeCandidateScore(candidateMap, neighbor.neighborId, 'cooccurrence', neighbor.weight, 'cooccurrence');
    }
  }
  
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
    
    // 1. Adjacency edges (especially important for tail continuity)
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
  }
  
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
 * Normalizes scores and applies configured weights.
 */
function computeFinalScores(
  candidates: RecommendationCandidate[]
): RecommendationCandidate[] {
  // Find maximum scores for normalization
  let maxAdjacency = 0;
  let maxCooccurrence = 0;
  
  for (const c of candidates) {
    maxAdjacency = Math.max(maxAdjacency, c.scores.adjacency);
    maxCooccurrence = Math.max(maxCooccurrence, c.scores.cooccurrence);
  }
  
  // Avoid division by zero
  if (maxAdjacency === 0) maxAdjacency = 1;
  if (maxCooccurrence === 0) maxCooccurrence = 1;
  
  // Compute weighted sum for each candidate
  for (const c of candidates) {
    const normalizedAdjacency = c.scores.adjacency / maxAdjacency;
    const normalizedCooccurrence = c.scores.cooccurrence / maxCooccurrence;
    
    c.totalScore = 
      scoringWeights.adjacency * normalizedAdjacency +
      scoringWeights.coMembership * normalizedCooccurrence;
      
    // Diversity bonus: tracks from both sources score higher
    if (c.sources.size > 1) {
      c.totalScore += 0.05;
    }
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
