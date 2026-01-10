/**
 * Mock Spotify API server for E2E testing
 * Serves deterministic responses without real OAuth or external dependencies
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  console.log(`[mock-spotify] ${req.method} ${req.path}`);
  next();
});

// Helper to load fixture
function loadFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

// GET /v1/me - Current user profile
app.get('/v1/me', (req, res) => {
  res.json(loadFixture('me'));
});

// GET /v1/me/playlists - User's playlists
app.get('/v1/me/playlists', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  const allPlaylists = loadFixture('playlists');
  const items = allPlaylists.items.slice(offset, offset + limit);
  
  const hasMore = offset + limit < allPlaylists.items.length;
  const nextOffset = hasMore ? offset + limit : null;
  
  res.json({
    href: `http://spotify-mock:8080/v1/me/playlists?offset=${offset}&limit=${limit}`,
    items,
    limit,
    next: nextOffset ? `http://spotify-mock:8080/v1/me/playlists?offset=${nextOffset}&limit=${limit}` : null,
    offset,
    previous: offset > 0 ? `http://spotify-mock:8080/v1/me/playlists?offset=${Math.max(0, offset - limit)}&limit=${limit}` : null,
    total: allPlaylists.items.length
  });
});

// GET /v1/playlists/:id - Playlist details
app.get('/v1/playlists/:id', (req, res) => {
  try {
    const playlist = loadFixture(`playlist-${req.params.id}`);
    res.json(playlist);
  } catch (_err) {
    res.status(404).json({ error: { status: 404, message: 'Playlist not found' } });
  }
});

// GET /v1/playlists/:id/tracks - Playlist tracks
app.get('/v1/playlists/:id/tracks', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    const allTracks = loadFixture(`playlist-${req.params.id}-tracks`);
    const items = allTracks.items.slice(offset, offset + limit);
    
    const hasMore = offset + limit < allTracks.items.length;
    const nextOffset = hasMore ? offset + limit : null;
    
    res.json({
      href: `http://spotify-mock:8080/v1/playlists/${req.params.id}/tracks?offset=${offset}&limit=${limit}`,
      items,
      limit,
      next: nextOffset ? `http://spotify-mock:8080/v1/playlists/${req.params.id}/tracks?offset=${nextOffset}&limit=${limit}` : null,
      offset,
      previous: offset > 0 ? `http://spotify-mock:8080/v1/playlists/${req.params.id}/tracks?offset=${Math.max(0, offset - limit)}&limit=${limit}` : null,
      total: allTracks.items.length,
      snapshot_id: allTracks.snapshot_id || 'mock-snapshot-id'
    });
  } catch (_err) {
    res.status(404).json({ error: { status: 404, message: 'Playlist not found' } });
  }
});

// PUT /v1/playlists/:id/tracks - Reorder tracks
app.put('/v1/playlists/:id/tracks', (req, res) => {
  console.log('[mock-spotify] Reorder tracks:', req.body);
  
  // Return success with new snapshot_id
  res.json({
    snapshot_id: `mock-snapshot-${Date.now()}`
  });
});

// POST /v1/playlists/:id/tracks - Add tracks
app.post('/v1/playlists/:id/tracks', (req, res) => {
  console.log('[mock-spotify] Add tracks:', req.body);
  
  res.json({
    snapshot_id: `mock-snapshot-${Date.now()}`
  });
});

// DELETE /v1/playlists/:id/tracks - Remove tracks
app.delete('/v1/playlists/:id/tracks', (req, res) => {
  console.log('[mock-spotify] Remove tracks:', req.body);
  
  res.json({
    snapshot_id: `mock-snapshot-${Date.now()}`
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'spotify-mock' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      status: 404,
      message: `Mock endpoint not found: ${req.method} ${req.path}`
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-spotify] Mock Spotify API listening on http://0.0.0.0:${PORT}`);
  console.log('[mock-spotify] Available endpoints:');
  console.log('  GET  /v1/me');
  console.log('  GET  /v1/me/playlists');
  console.log('  GET  /v1/playlists/:id');
  console.log('  GET  /v1/playlists/:id/tracks');
  console.log('  PUT  /v1/playlists/:id/tracks');
  console.log('  POST /v1/playlists/:id/tracks');
  console.log('  DELETE /v1/playlists/:id/tracks');
});
