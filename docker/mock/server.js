/**
 * Mock Spotify API server for E2E testing
 * Serves deterministic responses without real OAuth or external dependencies
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

const ACTIVE_DEVICE = {
  id: 'mock-device-1',
  is_active: true,
  is_private_session: false,
  is_restricted: false,
  name: 'Mock Spotify Device',
  type: 'Computer',
  volume_percent: 75,
  supports_volume: true,
};

let playbackState = null;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  console.debug(`[mock-spotify] ${req.method} ${req.path}`);
  next();
});

// Helper to load fixture
function loadFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', `${name}.json`);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function resolveContextFromUri(contextUri) {
  if (!contextUri || typeof contextUri !== 'string') {
    return null;
  }

  const [provider, type, id] = contextUri.split(':');
  if (provider !== 'spotify' || !type || !id) {
    return null;
  }

  return { type, id };
}

function loadPlaylistTracksById(playlistId) {
  try {
    const fixture = loadFixture(`playlist-${playlistId}-tracks`);
    return Array.isArray(fixture.items) ? fixture.items : [];
  } catch {
    return [];
  }
}

function findTrackByUri(trackUri, contextUri) {
  if (typeof trackUri === 'string' && trackUri.length > 0) {
    const allTracks = [
      ...loadPlaylistTracksById('test-playlist-1'),
      ...loadPlaylistTracksById('test-playlist-2'),
    ];

    const matched = allTracks.find((item) => item?.track?.uri === trackUri);
    if (matched?.track) {
      return matched.track;
    }
  }

  const context = resolveContextFromUri(contextUri);
  if (!context || context.type !== 'playlist') {
    return null;
  }

  const playlistTracks = loadPlaylistTracksById(context.id);
  const firstTrack = playlistTracks[0]?.track;
  return firstTrack ?? null;
}

function buildPlaybackState({ track, contextUri, progressMs = 0 }) {
  const context = resolveContextFromUri(contextUri);

  return {
    device: ACTIVE_DEVICE,
    repeat_state: 'off',
    shuffle_state: false,
    context: context
      ? {
          type: context.type,
          href: `http://spotify-mock:8080/v1/${context.type}s/${context.id}`,
          uri: contextUri,
        }
      : null,
    timestamp: Date.now(),
    progress_ms: progressMs,
    is_playing: true,
    item: track,
    currently_playing_type: 'track',
    actions: {
      disallows: {},
    },
  };
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

// GET /v1/me/player - Current playback state (204 = no active playback)
app.get('/v1/me/player', (_req, res) => {
  if (!playbackState) {
    return res.status(204).send();
  }

  res.json(playbackState);
});

// GET /v1/me/player/devices - Available playback devices
app.get('/v1/me/player/devices', (_req, res) => {
  res.json({ devices: [ACTIVE_DEVICE] });
});

// PUT /v1/me/player/play - Start playback
app.put('/v1/me/player/play', (req, res) => {
  const trackUri = req.body?.offset?.uri || req.body?.uris?.[0];
  const contextUri = req.body?.context_uri || null;
  const track = findTrackByUri(trackUri, contextUri);

  if (!track) {
    return res.status(404).json({ error: { status: 404, message: 'No active device or track context' } });
  }

  playbackState = buildPlaybackState({
    track,
    contextUri,
    progressMs: typeof req.body?.position_ms === 'number' ? req.body.position_ms : 0,
  });

  res.status(204).send();
});

// PUT /v1/me/player/pause - Pause playback
app.put('/v1/me/player/pause', (_req, res) => {
  if (playbackState) {
    playbackState = {
      ...playbackState,
      is_playing: false,
      timestamp: Date.now(),
    };
  }

  res.status(204).send();
});

// POST /v1/me/player/next - Skip next
app.post('/v1/me/player/next', (_req, res) => {
  res.status(204).send();
});

// POST /v1/me/player/previous - Skip previous
app.post('/v1/me/player/previous', (_req, res) => {
  res.status(204).send();
});

// PUT /v1/me/player/seek - Seek position
app.put('/v1/me/player/seek', (req, res) => {
  if (playbackState) {
    const parsedPosition = Number.parseInt(String(req.query.position_ms ?? '0'), 10);
    playbackState = {
      ...playbackState,
      progress_ms: Number.isFinite(parsedPosition) ? parsedPosition : playbackState.progress_ms,
      timestamp: Date.now(),
    };
  }

  res.status(204).send();
});

// PUT /v1/me/player/shuffle - Toggle shuffle
app.put('/v1/me/player/shuffle', (req, res) => {
  if (playbackState) {
    playbackState = {
      ...playbackState,
      shuffle_state: String(req.query.state) === 'true',
      timestamp: Date.now(),
    };
  }

  res.status(204).send();
});

// PUT /v1/me/player/repeat - Set repeat mode
app.put('/v1/me/player/repeat', (req, res) => {
  if (playbackState) {
    playbackState = {
      ...playbackState,
      repeat_state: typeof req.query.state === 'string' ? req.query.state : playbackState.repeat_state,
      timestamp: Date.now(),
    };
  }

  res.status(204).send();
});

// PUT /v1/me/player/volume - Set volume
app.put('/v1/me/player/volume', (req, res) => {
  const volume = Number.parseInt(String(req.query.volume_percent ?? ACTIVE_DEVICE.volume_percent), 10);
  if (Number.isFinite(volume)) {
    ACTIVE_DEVICE.volume_percent = Math.max(0, Math.min(100, volume));
  }

  if (playbackState) {
    playbackState = {
      ...playbackState,
      device: {
        ...playbackState.device,
        volume_percent: ACTIVE_DEVICE.volume_percent,
      },
      timestamp: Date.now(),
    };
  }

  res.status(204).send();
});

// PUT /v1/me/player - Transfer playback
app.put('/v1/me/player', (_req, res) => {
  res.status(204).send();
});

// PUT /v1/playlists/:id/tracks - Reorder tracks
app.put('/v1/playlists/:id/tracks', (req, res) => {
  console.debug('[mock-spotify] Reorder tracks:', req.body);
  
  // Return success with new snapshot_id
  res.json({
    snapshot_id: `mock-snapshot-${Date.now()}`
  });
});

// POST /v1/playlists/:id/tracks - Add tracks
app.post('/v1/playlists/:id/tracks', (req, res) => {
  console.debug('[mock-spotify] Add tracks:', req.body);
  
  res.json({
    snapshot_id: `mock-snapshot-${Date.now()}`
  });
});

// DELETE /v1/playlists/:id/tracks - Remove tracks
app.delete('/v1/playlists/:id/tracks', (req, res) => {
  console.debug('[mock-spotify] Remove tracks:', req.body);
  
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
  console.debug(`[mock-spotify] Mock Spotify API listening on http://0.0.0.0:${PORT}`);
  console.debug('[mock-spotify] Available endpoints:');
  console.debug('  GET  /v1/me');
  console.debug('  GET  /v1/me/playlists');
  console.debug('  GET  /v1/playlists/:id');
  console.debug('  GET  /v1/playlists/:id/tracks');
  console.debug('  PUT  /v1/playlists/:id/tracks');
  console.debug('  POST /v1/playlists/:id/tracks');
  console.debug('  DELETE /v1/playlists/:id/tracks');
});
