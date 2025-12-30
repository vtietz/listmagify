/**
 * Catalog data management for recommendation system.
 * 
 * This module handles:
 * - Upserting catalog data (artist top tracks, album tracks, popularity)
 * - Deriving catalog-based edges
 * - Managing TTL and refresh logic
 */

import { getRecsDb, unixNow, withTransaction } from "./db";
import { recsConfig } from "./env";
import {
  fetchArtistTopTracks,
  fetchAlbumTracks,
  fetchTrackPopularities,
  fetchRelatedArtists,
  type ArtistTopTracksResult,
  type AlbumTracksResult,
  type TrackPopularityResult,
  type RelatedArtistsResult,
} from "@/lib/spotify/catalog";

/**
 * Check if catalog data is stale based on TTL.
 */
function isStale(fetchedAt: number): boolean {
  const ttlSeconds = recsConfig.catalogTtlDays * 24 * 60 * 60;
  return unixNow() - fetchedAt > ttlSeconds;
}

// ============================================================================
// UPSERT FUNCTIONS
// ============================================================================

/**
 * Upsert artist top tracks into the database.
 * 
 * @param data - Artist top tracks data from Spotify
 */
export function upsertArtistTopTracks(data: ArtistTopTracksResult): number {
  if (data.tracks.length === 0) return 0;
  
  const now = unixNow();
  const db = getRecsDb();
  
  return withTransaction(() => {
    // Clear old data for this artist/market
    db.prepare(`
      DELETE FROM artist_top_tracks WHERE artist_id = ? AND market = ?
    `).run(data.artistId, data.market);
    
    // Insert new data
    const insert = db.prepare(`
      INSERT INTO artist_top_tracks (artist_id, market, track_id, rank, fetched_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    let count = 0;
    for (const track of data.tracks) {
      insert.run(data.artistId, data.market, track.trackId, track.rank, now);
      count++;
    }
    
    return count;
  });
}

/**
 * Upsert album tracks into the database.
 * 
 * @param data - Album tracks data from Spotify
 */
export function upsertAlbumTracks(data: AlbumTracksResult): number {
  if (data.tracks.length === 0) return 0;
  
  const now = unixNow();
  const db = getRecsDb();
  
  return withTransaction(() => {
    // Clear old data for this album
    db.prepare(`DELETE FROM album_tracks WHERE album_id = ?`).run(data.albumId);
    
    // Insert new data
    const insert = db.prepare(`
      INSERT INTO album_tracks (album_id, track_id, position, fetched_at)
      VALUES (?, ?, ?, ?)
    `);
    
    let count = 0;
    for (const track of data.tracks) {
      insert.run(data.albumId, track.trackId, track.position, now);
      count++;
    }
    
    return count;
  });
}

/**
 * Upsert track popularity data.
 * 
 * @param data - Array of track popularity data
 */
export function upsertTrackPopularity(data: TrackPopularityResult[]): number {
  if (data.length === 0) return 0;
  
  const now = unixNow();
  const db = getRecsDb();
  
  return withTransaction(() => {
    const upsert = db.prepare(`
      INSERT INTO track_popularity (track_id, popularity, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET
        popularity = excluded.popularity,
        fetched_at = excluded.fetched_at
    `);
    
    let count = 0;
    for (const item of data) {
      upsert.run(item.trackId, item.popularity, now);
      count++;
    }
    
    return count;
  });
}

/**
 * Upsert related artists data.
 * 
 * @param data - Related artists data from Spotify
 */
export function upsertRelatedArtists(data: RelatedArtistsResult): number {
  if (data.relatedArtists.length === 0) return 0;
  
  const now = unixNow();
  const db = getRecsDb();
  
  return withTransaction(() => {
    // Clear old data for this artist
    db.prepare(`DELETE FROM related_artists WHERE artist_id = ?`).run(data.artistId);
    
    // Insert new data
    const insert = db.prepare(`
      INSERT INTO related_artists (artist_id, related_artist_id, weight, fetched_at)
      VALUES (?, ?, ?, ?)
    `);
    
    let count = 0;
    for (const related of data.relatedArtists) {
      insert.run(data.artistId, related.artistId, related.weight, now);
      count++;
    }
    
    return count;
  });
}

// ============================================================================
// CATALOG EDGE DERIVATION
// ============================================================================

/**
 * Derive catalog edges from stored catalog data.
 * Creates edges in track_catalog_edges table.
 * 
 * Edge types:
 * - artist_top: Links between tracks by the same artist (from top tracks)
 * - album_adj: Links between adjacent tracks in an album
 * - related_artist_top: Links between top tracks of related artists
 */
export function deriveCatalogEdges(): {
  artistTop: number;
  albumAdj: number;
  relatedArtistTop: number;
} {
  const db = getRecsDb();
  const now = unixNow();
  
  return withTransaction(() => {
    // Clear existing catalog edges
    db.prepare(`DELETE FROM track_catalog_edges`).run();
    
    let artistTopCount = 0;
    let albumAdjCount = 0;
    let relatedArtistTopCount = 0;
    
    // 1. Artist top track edges
    // Link top tracks by the same artist (weight = 1/rank)
    const artistTopRows = db.prepare(`
      SELECT DISTINCT a1.track_id as from_track, a2.track_id as to_track, 
             a2.rank as to_rank
      FROM artist_top_tracks a1
      JOIN artist_top_tracks a2 ON a1.artist_id = a2.artist_id 
           AND a1.market = a2.market 
           AND a1.track_id != a2.track_id
    `).all() as Array<{ from_track: string; to_track: string; to_rank: number }>;
    
    const insertEdge = db.prepare(`
      INSERT INTO track_catalog_edges (edge_type, from_track_id, to_track_id, weight, last_seen_ts)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(edge_type, from_track_id, to_track_id) DO UPDATE SET
        weight = excluded.weight,
        last_seen_ts = excluded.last_seen_ts
    `);
    
    for (const row of artistTopRows) {
      // Weight inversely proportional to destination rank
      const weight = 1.0 / row.to_rank;
      insertEdge.run('artist_top', row.from_track, row.to_track, weight, now);
      artistTopCount++;
    }
    
    // 2. Album adjacency edges
    // Link consecutive tracks in albums
    const albumGroups = db.prepare(`
      SELECT album_id FROM album_tracks GROUP BY album_id
    `).all() as Array<{ album_id: string }>;
    
    for (const { album_id } of albumGroups) {
      const albumTracks = db.prepare(`
        SELECT track_id, position FROM album_tracks 
        WHERE album_id = ? ORDER BY position
      `).all(album_id) as Array<{ track_id: string; position: number }>;
      
      for (let i = 0; i < albumTracks.length - 1; i++) {
        const current = albumTracks[i];
        const next = albumTracks[i + 1];
        
        if (current && next) {
          // Strong weight for immediate next track
          insertEdge.run('album_adj', current.track_id, next.track_id, 1.0, now);
          albumAdjCount++;
          
          // Also add reverse direction with slightly lower weight
          insertEdge.run('album_adj', next.track_id, current.track_id, 0.8, now);
          albumAdjCount++;
          
          // Weaker weight for skip-one track (i -> i+2)
          const skipOne = albumTracks[i + 2];
          if (skipOne) {
            insertEdge.run('album_adj', current.track_id, skipOne.track_id, 0.5, now);
            albumAdjCount++;
          }
        }
      }
    }
    
    // 3. Related artist top track edges (always generate if data exists)
    const relatedRows = db.prepare(`
      SELECT a1.track_id as from_track, a2.track_id as to_track,
             r.weight as related_weight, a2.rank as to_rank
      FROM artist_top_tracks a1
      JOIN related_artists r ON a1.artist_id = r.artist_id
      JOIN artist_top_tracks a2 ON r.related_artist_id = a2.artist_id 
           AND a1.market = a2.market
      WHERE a1.rank <= 3  -- Only top 3 tracks of seed artist
        AND a2.rank <= 5  -- Only top 5 tracks of related artist
    `).all() as Array<{
      from_track: string;
      to_track: string;
      related_weight: number;
      to_rank: number;
    }>;
    
    for (const row of relatedRows) {
      // Combined weight: related_weight * (1/rank)
      const weight = row.related_weight * (1.0 / row.to_rank) * 0.3; // Scale down
      insertEdge.run('related_artist_top', row.from_track, row.to_track, weight, now);
      relatedArtistTopCount++;
    }
    
    return {
      artistTop: artistTopCount,
      albumAdj: albumAdjCount,
      relatedArtistTop: relatedArtistTopCount,
    };
  });
}

// ============================================================================
// FETCH AND UPSERT HELPERS
// ============================================================================

/**
 * Fetch and store artist top tracks if stale or missing.
 * 
 * @param artistId - Spotify artist ID
 * @param market - Market code (default from config)
 * @param force - Force refresh even if not stale
 */
export async function ensureArtistTopTracks(
  artistId: string,
  market: string = recsConfig.defaultMarket,
  force: boolean = false
): Promise<number> {
  const db = getRecsDb();
  
  // Check if we have recent data
  const existing = db.prepare(`
    SELECT fetched_at FROM artist_top_tracks 
    WHERE artist_id = ? AND market = ? 
    LIMIT 1
  `).get(artistId, market) as { fetched_at: number } | undefined;
  
  if (existing && !force && !isStale(existing.fetched_at)) {
    return 0; // Already up to date
  }
  
  // Fetch from Spotify
  const data = await fetchArtistTopTracks(artistId, market);
  return upsertArtistTopTracks(data);
}

/**
 * Fetch and store album tracks if stale or missing.
 * 
 * @param albumId - Spotify album ID
 * @param force - Force refresh even if not stale
 */
export async function ensureAlbumTracks(
  albumId: string,
  force: boolean = false
): Promise<number> {
  const db = getRecsDb();
  
  // Check if we have recent data
  const existing = db.prepare(`
    SELECT fetched_at FROM album_tracks WHERE album_id = ? LIMIT 1
  `).get(albumId) as { fetched_at: number } | undefined;
  
  if (existing && !force && !isStale(existing.fetched_at)) {
    return 0;
  }
  
  // Fetch from Spotify
  const data = await fetchAlbumTracks(albumId);
  return upsertAlbumTracks(data);
}

/**
 * Fetch and store track popularities.
 * 
 * @param trackIds - Array of track IDs to update
 * @param force - Force refresh even if not stale
 */
export async function ensureTrackPopularities(
  trackIds: string[],
  force: boolean = false
): Promise<number> {
  if (trackIds.length === 0) return 0;
  
  const db = getRecsDb();
  
  // Filter to tracks that need updating
  let idsToFetch = trackIds;
  
  if (!force) {
    const placeholders = trackIds.map(() => '?').join(',');
    const staleThreshold = unixNow() - (recsConfig.catalogTtlDays * 24 * 60 * 60);
    
    const existing = db.prepare(`
      SELECT track_id FROM track_popularity 
      WHERE track_id IN (${placeholders}) AND fetched_at > ?
    `).all(...trackIds, staleThreshold) as Array<{ track_id: string }>;
    
    const existingIds = new Set(existing.map(r => r.track_id));
    idsToFetch = trackIds.filter(id => !existingIds.has(id));
  }
  
  if (idsToFetch.length === 0) return 0;
  
  // Fetch from Spotify
  const data = await fetchTrackPopularities(idsToFetch);
  return upsertTrackPopularity(data);
}

/**
 * Fetch and store related artists if stale or missing.
 * 
 * @param artistId - Spotify artist ID
 * @param force - Force refresh even if not stale
 */
export async function ensureRelatedArtists(
  artistId: string,
  force: boolean = false
): Promise<number> {
  const db = getRecsDb();
  
  // Check if we have recent data
  const existing = db.prepare(`
    SELECT fetched_at FROM related_artists WHERE artist_id = ? LIMIT 1
  `).get(artistId) as { fetched_at: number } | undefined;
  
  if (existing && !force && !isStale(existing.fetched_at)) {
    return 0;
  }
  
  // Fetch from Spotify
  const data = await fetchRelatedArtists(artistId);
  return upsertRelatedArtists(data);
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Get catalog edges for a track.
 * 
 * @param trackId - Source track ID
 * @param edgeType - Optional filter by edge type
 * @param limit - Maximum edges to return
 */
export function getCatalogEdges(
  trackId: string,
  edgeType?: 'artist_top' | 'album_adj' | 'related_artist_top',
  limit: number = 50
): Array<{
  toTrackId: string;
  edgeType: string;
  weight: number;
}> {
  const db = getRecsDb();
  
  let query = `
    SELECT to_track_id, edge_type, weight
    FROM track_catalog_edges
    WHERE from_track_id = ?
  `;
  const params: (string | number)[] = [trackId];
  
  if (edgeType) {
    query += ` AND edge_type = ?`;
    params.push(edgeType);
  }
  
  query += ` ORDER BY weight DESC LIMIT ?`;
  params.push(limit);
  
  const rows = db.prepare(query).all(...params) as Array<{
    to_track_id: string;
    edge_type: string;
    weight: number;
  }>;
  
  return rows.map(r => ({
    toTrackId: r.to_track_id,
    edgeType: r.edge_type,
    weight: r.weight,
  }));
}

/**
 * Get track popularity from cache.
 * 
 * @param trackId - Track ID
 */
export function getTrackPopularity(trackId: string): number | null {
  const db = getRecsDb();
  
  const row = db.prepare(`
    SELECT popularity FROM track_popularity WHERE track_id = ?
  `).get(trackId) as { popularity: number } | undefined;
  
  return row?.popularity ?? null;
}

/**
 * Get popularities for multiple tracks.
 * 
 * @param trackIds - Array of track IDs
 */
export function getTrackPopularities(trackIds: string[]): Map<string, number> {
  if (trackIds.length === 0) return new Map();
  
  const db = getRecsDb();
  const placeholders = trackIds.map(() => '?').join(',');
  
  const rows = db.prepare(`
    SELECT track_id, popularity FROM track_popularity 
    WHERE track_id IN (${placeholders})
  `).all(...trackIds) as Array<{ track_id: string; popularity: number }>;
  
  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(row.track_id, row.popularity);
  }
  
  return result;
}

/**
 * Get album adjacency info for a track.
 * Returns previous and next tracks in the same album.
 * 
 * @param trackId - Track ID
 */
export function getAlbumAdjacency(trackId: string): {
  albumId: string;
  position: number;
  prevTrackId: string | null;
  nextTrackId: string | null;
} | null {
  const db = getRecsDb();
  
  // Get this track's album and position
  const current = db.prepare(`
    SELECT album_id, position FROM album_tracks WHERE track_id = ?
  `).get(trackId) as { album_id: string; position: number } | undefined;
  
  if (!current) return null;
  
  // Get adjacent tracks
  const prev = db.prepare(`
    SELECT track_id FROM album_tracks 
    WHERE album_id = ? AND position = ?
  `).get(current.album_id, current.position - 1) as { track_id: string } | undefined;
  
  const next = db.prepare(`
    SELECT track_id FROM album_tracks 
    WHERE album_id = ? AND position = ?
  `).get(current.album_id, current.position + 1) as { track_id: string } | undefined;
  
  return {
    albumId: current.album_id,
    position: current.position,
    prevTrackId: prev?.track_id ?? null,
    nextTrackId: next?.track_id ?? null,
  };
}
