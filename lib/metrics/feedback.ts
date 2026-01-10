/**
 * Feedback metrics storage and retrieval.
 * Stores NPS scores and comments in the metrics database.
 */

import { getDb } from './db';
import { hashUserId } from './logger';

export interface FeedbackParams {
  userId: string | null;
  npsScore: number | null;
  comment: string | null;
  name: string | null;
  email: string | null;
}

export interface FeedbackEntry {
  id: number;
  ts: string;
  userHash: string | null;
  npsScore: number | null;
  comment: string | null;
  name: string | null;
  email: string | null;
}

export interface FeedbackStats {
  /** Total number of feedback entries in period */
  totalResponses: number;
  /** Average NPS score */
  averageScore: number;
  /** Calculated NPS: % promoters (9-10) - % detractors (0-6) */
  nps: number;
  /** Number of promoters (9-10) */
  promoters: number;
  /** Number of passives (7-8) */
  passives: number;
  /** Number of detractors (0-6) */
  detractors: number;
  /** Recent feedback entries */
  recentFeedback: FeedbackEntry[];
}

/**
 * Save feedback to the database.
 * Returns the inserted row ID or null if metrics disabled.
 */
export function saveFeedback(params: FeedbackParams): number | null {
  const db = getDb();
  if (!db) return null;

  try {
    const userHash = params.userId ? hashUserId(params.userId) : null;
    
    const stmt = db.prepare(`
      INSERT INTO feedback (user_hash, nps_score, comment, name, email)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(userHash, params.npsScore, params.comment, params.name, params.email);
    return result.lastInsertRowid as number;
  } catch (error) {
    console.error('[metrics/feedback] Failed to save feedback:', error);
    return null;
  }
}

/**
 * Get feedback statistics for a date range.
 */
export function getFeedbackStats(range: { from: string; to: string }): FeedbackStats {
  const db = getDb();
  
  const defaultStats: FeedbackStats = {
    totalResponses: 0,
    averageScore: 0,
    nps: 0,
    promoters: 0,
    passives: 0,
    detractors: 0,
    recentFeedback: [],
  };
  
  if (!db) return defaultStats;

  try {
    // Get all feedback in range
    const feedbackStmt = db.prepare(`
      SELECT id, ts, user_hash as userHash, nps_score as npsScore, comment, name, email
      FROM feedback
      WHERE DATE(ts) >= ? AND DATE(ts) <= ?
      ORDER BY ts DESC
    `);
    
    const feedback = feedbackStmt.all(range.from, range.to) as FeedbackEntry[];
    
    if (feedback.length === 0) return defaultStats;

    const scored = feedback.filter((f) => typeof f.npsScore === 'number') as Array<
      Omit<FeedbackEntry, 'npsScore'> & { npsScore: number }
    >;

    if (scored.length === 0) {
      return {
        ...defaultStats,
        recentFeedback: feedback.slice(0, 20),
      };
    }

    // Calculate NPS components
    const promoters = scored.filter((f) => f.npsScore >= 9).length;
    const passives = scored.filter((f) => f.npsScore >= 7 && f.npsScore <= 8).length;
    const detractors = scored.filter((f) => f.npsScore <= 6).length;
    
    const totalResponses = scored.length;
    const averageScore = scored.reduce((sum, f) => sum + f.npsScore, 0) / totalResponses;
    
    // NPS = % promoters - % detractors (ranges from -100 to +100)
    const nps = Math.round(((promoters - detractors) / totalResponses) * 100);

    return {
      totalResponses,
      averageScore: Math.round(averageScore * 10) / 10,
      nps,
      promoters,
      passives,
      detractors,
      recentFeedback: feedback.slice(0, 20), // Return 20 most recent
    };
  } catch (error) {
    console.error('[metrics/feedback] Failed to get feedback stats:', error);
    return defaultStats;
  }
}
