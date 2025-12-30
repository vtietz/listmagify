/**
 * Environment configuration for the recommendation system.
 * 
 * Simplified config - only RECS_ENABLED and RECS_DB_PATH are user-configurable.
 * Other parameters use sensible defaults optimized for typical usage.
 */

import { z } from "zod";

/**
 * Schema for recommendation system environment variables.
 * Only two user-facing settings - the rest are internal defaults.
 */
const recsEnvSchema = z.object({
  /** Master enable flag for the recommendation system */
  RECS_ENABLED: z.coerce.boolean().default(false),
  
  /** SQLite database path (relative to project root or absolute) */
  RECS_DB_PATH: z.string().default("./data/recs.db"),
});

export type RecsEnv = z.infer<typeof recsEnvSchema>;

/**
 * Parsed and validated recommendation environment configuration.
 */
export const recsEnv: RecsEnv = (() => {
  const raw = {
    RECS_ENABLED: process.env.RECS_ENABLED,
    RECS_DB_PATH: process.env.RECS_DB_PATH,
  };
  
  return recsEnvSchema.parse(raw);
})();

/**
 * Internal configuration constants.
 * These are not exposed as env vars - they're tuned for optimal behavior.
 */
export const recsConfig = {
  /** Time-to-live in days for cached catalog data */
  catalogTtlDays: 7,
  
  /** Default market for catalog fetches (can be overridden per-request) */
  defaultMarket: "US",
  
  /** Maximum number of edge entries per track (for capping during maintenance) */
  maxEdgesPerTrack: 200,
  
  /** Snapshot retention horizon in days */
  snapshotRetentionDays: 90,
  
  /** Weekly decay factor for edge weights (0.9-1.0) */
  decayFactor: 0.98,
};

/**
 * Scoring weight configuration for recommendation blending.
 * These can be tuned based on user feedback and A/B testing.
 */
export const scoringWeights = {
  /** Weight for sequential adjacency signal (playlist order) */
  adjacency: 0.6,
  
  /** Weight for co-membership signal (tracks in same playlists) */
  coMembership: 0.3,
  
  /** Weight for audio feature similarity (if available) */
  audioContent: 0.1,
  
  /** Recency boost weight */
  recency: 0.05,
  
  /** Catalog signal weights */
  catalog: {
    /** Shared artist top tracks */
    artistOverlap: 0.15,
    
    /** Album continuity (next/prev track) */
    albumContinuity: 0.15,
    
    /** Track popularity (normalized 0-1) */
    popularity: 0.10,
    
    /** Related artist signal */
    relatedArtist: 0.05,
  },
};

/**
 * Algorithm tuning parameters.
 */
export const recsParams = {
  /** Number of candidates to fetch per seed track */
  candidatesPerSeed: 50,
  
  /** Maximum neighbors to consider in co-occurrence */
  maxCooccurrenceNeighbors: 100,
  
  /** Co-occurrence window size (tracks within N positions) */
  cooccurrenceWindow: 5,
  
  /** Final recommendations to return */
  defaultTopN: 20,
  
  /** Minimum score threshold for inclusion */
  minScoreThreshold: 0.01,
};
