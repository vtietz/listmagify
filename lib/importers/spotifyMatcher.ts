/**
 * Spotify track matcher service
 * 
 * Handles matching imported tracks (from Last.fm, etc.) to Spotify tracks
 * using search queries, normalization, and scoring.
 */

import type {
  ImportedTrackDTO,
  MatchResult,
  MatchConfidence,
  SpotifyMatchedTrack,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Text Normalization & Sanitization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Patterns to remove from track/artist names for better matching
 */
const SANITIZE_PATTERNS = [
  // Remaster/version indicators
  /\s*[-–—]\s*(remaster(ed)?|remix(ed)?|live|acoustic|demo|radio edit|single version|album version|extended|edit)\s*\d*\s*/gi,
  /\s*\((remaster(ed)?|remix(ed)?|live|acoustic|demo|radio edit|single version|album version|extended|edit)\s*\d*\)/gi,
  /\s*\[(remaster(ed)?|remix(ed)?|live|acoustic|demo|radio edit|single version|album version|extended|edit)\s*\d*\]/gi,
  
  // Year indicators in parentheses
  /\s*\(\d{4}(\s*remaster)?\)/gi,
  /\s*\[\d{4}(\s*remaster)?\]/gi,
  
  // Featured artists
  /\s*(\(|\[)?\s*(feat\.?|ft\.?|featuring|with)\s+[^)\]]+(\)|\])?/gi,
  
  // Bonus track indicators
  /\s*[-–—]\s*bonus\s*track/gi,
  /\s*\(bonus\s*track\)/gi,
  
  // Deluxe/special edition markers
  /\s*[-–—]\s*(deluxe|special|expanded|anniversary)\s*(edition|version)?/gi,
];

/**
 * Normalize a string for matching (lowercase, remove extra whitespace, etc.)
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[\u2018\u2019]/g, "'") // Normalize curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // Normalize curly double quotes
    .replace(/&/g, 'and')            // Normalize ampersand
    .replace(/[^\w\s'"-]/g, ' ')     // Remove special chars except basics
    .replace(/\s+/g, ' ')            // Collapse whitespace
    .trim();
}

/**
 * Sanitize track/artist name by removing common suffixes and indicators
 */
export function sanitizeName(name: string): string {
  if (!name) return '';
  
  let result = name;
  for (const pattern of SANITIZE_PATTERNS) {
    result = result.replace(pattern, '');
  }
  
  return normalizeText(result);
}

/**
 * Build a Spotify search query from imported track data
 */
export function buildSearchQuery(track: ImportedTrackDTO, includeAlbum = false): string {
  const artist = sanitizeName(track.artistName);
  const trackName = sanitizeName(track.trackName);
  
  let query = `track:"${trackName}" artist:"${artist}"`;
  
  if (includeAlbum && track.albumName) {
    const album = sanitizeName(track.albumName);
    query += ` album:"${album}"`;
  }
  
  return query;
}

/**
 * Build a simpler fallback search query (just track + artist text)
 */
export function buildFallbackQuery(track: ImportedTrackDTO): string {
  return `${sanitizeName(track.trackName)} ${sanitizeName(track.artistName)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Similarity Scoring
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Jaccard similarity between two strings (token-based)
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeText(b).split(/\s+/).filter(Boolean));
  
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return intersection.size / union.size;
}

/**
 * Calculate string similarity using character-level comparison
 */
function levenshteinSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  
  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;
  
  // Simple character-based similarity (not full Levenshtein for performance)
  const maxLen = Math.max(normA.length, normB.length);
  let matches = 0;
  
  // Count matching characters at same positions
  const minLen = Math.min(normA.length, normB.length);
  for (let i = 0; i < minLen; i++) {
    if (normA[i] === normB[i]) matches++;
  }
  
  return matches / maxLen;
}

/**
 * Combined similarity score between two strings
 */
export function stringSimilarity(a: string, b: string): number {
  const jaccard = jaccardSimilarity(a, b);
  const levenshtein = levenshteinSimilarity(a, b);
  
  // Weight token-based similarity higher for song matching
  return jaccard * 0.6 + levenshtein * 0.4;
}

/**
 * Check if strings are effectively equal after normalization
 */
export function isEffectivelyEqual(a: string, b: string): boolean {
  return sanitizeName(a) === sanitizeName(b);
}

// ═══════════════════════════════════════════════════════════════════════════
// Match Scoring
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score a Spotify track against an imported track
 * Returns a score from 0-100
 */
export function scoreMatch(imported: ImportedTrackDTO, spotify: SpotifyMatchedTrack): number {
  let score = 0;
  
  // Track name matching (40 points max)
  const trackSimilarity = stringSimilarity(imported.trackName, spotify.name);
  const trackExact = isEffectivelyEqual(imported.trackName, spotify.name);
  score += trackExact ? 40 : trackSimilarity * 35;
  
  // Artist matching (40 points max)
  const importedArtist = sanitizeName(imported.artistName);
  const spotifyArtists = spotify.artists.map(a => sanitizeName(a));
  
  // Check if any Spotify artist matches
  const artistExact = spotifyArtists.some(a => a === importedArtist);
  const artistSimilarity = Math.max(
    ...spotifyArtists.map(a => stringSimilarity(imported.artistName, a))
  );
  
  score += artistExact ? 40 : artistSimilarity * 35;
  
  // Album matching bonus (10 points max)
  if (imported.albumName && spotify.album?.name) {
    const albumExact = isEffectivelyEqual(imported.albumName, spotify.album.name);
    const albumSimilarity = stringSimilarity(imported.albumName, spotify.album.name);
    score += albumExact ? 10 : albumSimilarity * 8;
  }
  
  // Popularity bonus (10 points max) - prefer popular versions
  if (spotify.popularity) {
    score += (spotify.popularity / 100) * 10;
  }
  
  return Math.min(100, Math.round(score));
}

/**
 * Determine match confidence from score
 */
export function getConfidence(score: number): MatchConfidence {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'low';
  return 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// Matching Service
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create match results from Spotify search results
 */
export function createMatchResult(
  imported: ImportedTrackDTO,
  spotifyTracks: SpotifyMatchedTrack[]
): MatchResult {
  if (spotifyTracks.length === 0) {
    return {
      imported,
      confidence: 'none',
      score: 0,
    };
  }
  
  // Score all candidates
  const scoredTracks = spotifyTracks.map(track => ({
    track,
    score: scoreMatch(imported, track),
  }));
  
  // Sort by score descending
  scoredTracks.sort((a, b) => b.score - a.score);
  
  const best = scoredTracks[0];
  if (!best) {
    return {
      imported,
      confidence: 'none' as MatchConfidence,
      score: 0,
      candidates: [],
    };
  }
  
  const confidence = getConfidence(best.score);
  
  return {
    imported,
    spotifyTrack: best.track,
    confidence,
    score: best.score,
    // Include top 5 candidates for manual selection
    candidates: scoredTracks.slice(0, 5).map(s => s.track),
  };
}

/**
 * Batch process match results and apply deduplication
 */
export function deduplicateMatches(results: MatchResult[]): MatchResult[] {
  const seen = new Set<string>();
  const unique: MatchResult[] = [];
  
  for (const result of results) {
    // Skip tracks without a match
    if (!result.spotifyTrack) {
      unique.push(result);
      continue;
    }
    
    // Skip duplicates based on Spotify track URI
    if (seen.has(result.spotifyTrack.uri)) {
      continue;
    }
    
    seen.add(result.spotifyTrack.uri);
    unique.push(result);
  }
  
  return unique;
}
