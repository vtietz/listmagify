/**
 * Mock TIDAL API server for E2E testing.
 * Serves deterministic JSON:API responses for provider-agnostic flows.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8081;
const BASE = '/v2';

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  console.debug(`[mock-tidal] ${req.method} ${req.path}`);
  next();
});

function loadFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', 'tidal', `${name}.json`);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const userFixture = loadFixture('user');
const playlistsFixture = loadFixture('playlists').items;
const playlistItemsFixture = loadFixture('playlist-items');
const tracksFixture = loadFixture('tracks').items;

const playlists = new Map(playlistsFixture.map((playlist) => [playlist.id, clone(playlist)]));
const playlistItems = new Map(
  Object.entries(playlistItemsFixture).map(([playlistId, entries]) => [playlistId, clone(entries)]),
);
const userCollectionTrackIds = new Set(
  Object.values(playlistItemsFixture)
    .flatMap((entries) => entries)
    .map((entry) => entry.trackId),
);

function nowIso() {
  return new Date().toISOString();
}

function safeLimit(value, fallback = 50, max = 100) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function safeOffset(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function imageResourceId(prefix, id) {
  return `${prefix}-${id}`;
}

function buildImageResource(id, url) {
  return {
    id,
    type: 'images',
    attributes: {
      files: [
        {
          href: url,
          meta: {
            width: 640,
            height: 640,
          },
        },
      ],
    },
  };
}

function buildUserResource(id, username) {
  return {
    id,
    type: 'users',
    attributes: {
      username,
      firstName: userFixture.firstName,
      lastName: userFixture.lastName,
      email: userFixture.email,
    },
  };
}

function buildPlaylistResource(playlist) {
  const playlistTrackCount = (playlistItems.get(playlist.id) ?? []).length;

  return {
    id: playlist.id,
    type: 'playlists',
    attributes: {
      name: playlist.name,
      description: playlist.description,
      accessType: playlist.accessType,
      numberOfItems: playlistTrackCount,
    },
    relationships: {
      owners: {
        data: [{ id: playlist.ownerId, type: 'users' }],
      },
      coverArt: {
        data: { id: imageResourceId('playlist-cover', playlist.id), type: 'images' },
      },
      collaborators: {
        data: playlist.collaborative ? [{ id: 'tidal-collaborator-1', type: 'users' }] : [],
      },
    },
  };
}

function buildPlaylistIncluded(playlist) {
  const included = [
    buildUserResource(playlist.ownerId, playlist.ownerUsername),
    buildImageResource(imageResourceId('playlist-cover', playlist.id), playlist.coverUrl),
  ];

  if (playlist.collaborative) {
    included.push(buildUserResource('tidal-collaborator-1', 'collaborator_user'));
  }

  return included;
}

function buildArtistResource(artist) {
  return {
    id: artist.id,
    type: 'artists',
    attributes: {
      name: artist.name,
    },
  };
}

function buildAlbumResource(track) {
  const albumImageId = imageResourceId('album-cover', track.album.id);

  return {
    id: track.album.id,
    type: 'albums',
    attributes: {
      title: track.album.title,
      releaseDate: track.album.releaseDate,
    },
    relationships: {
      coverArt: {
        data: {
          id: albumImageId,
          type: 'images',
        },
      },
    },
  };
}

function buildTrackResource(trackId, track) {
  return {
    id: trackId,
    type: 'tracks',
    attributes: {
      title: track.title,
      duration: track.duration,
      popularity: track.popularity,
      explicit: track.explicit,
    },
    relationships: {
      artists: {
        data: track.artists.map((artist) => ({ id: artist.id, type: 'artists' })),
      },
      albums: {
        data: [{ id: track.album.id, type: 'albums' }],
      },
    },
  };
}

function buildTrackIncluded(trackIds) {
  const includedByKey = new Map();

  for (const trackId of trackIds) {
    const track = tracksFixture[trackId];
    if (!track) {
      continue;
    }

    const trackResource = buildTrackResource(trackId, track);
    includedByKey.set(`tracks:${trackId}`, trackResource);

    for (const artist of track.artists) {
      includedByKey.set(`artists:${artist.id}`, buildArtistResource(artist));
    }

    includedByKey.set(`albums:${track.album.id}`, buildAlbumResource(track));
    includedByKey.set(
      `images:${imageResourceId('album-cover', track.album.id)}`,
      buildImageResource(imageResourceId('album-cover', track.album.id), track.album.coverUrl),
    );
  }

  return Array.from(includedByKey.values());
}

function generateItemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPlaylistOr404(playlistId, res) {
  const playlist = playlists.get(playlistId);
  if (!playlist) {
    res.status(404).json({ errors: [{ detail: `Playlist not found: ${playlistId}` }] });
    return null;
  }

  return playlist;
}

app.get(`${BASE}/users/me`, (_req, res) => {
  res.json({
    data: {
      id: userFixture.id,
      type: 'users',
      attributes: {
        username: userFixture.username,
        firstName: userFixture.firstName,
        lastName: userFixture.lastName,
        email: userFixture.email,
      },
    },
  });
});

app.get(`${BASE}/userCollectionPlaylists/me/relationships/items`, (req, res) => {
  const limit = safeLimit(req.query['page[size]']);
  const offset = safeOffset(req.query['page[offset]']);
  const allPlaylists = Array.from(playlists.values());
  const page = allPlaylists.slice(offset, offset + limit);

  const data = page.map((playlist) => ({ id: playlist.id, type: 'playlists' }));
  const included = page.flatMap((playlist) => [
    buildPlaylistResource(playlist),
    ...buildPlaylistIncluded(playlist),
  ]);

  const nextOffset = offset + limit;
  const hasNext = nextOffset < allPlaylists.length;

  res.json({
    data,
    included,
    links: {
      self: `http://tidal-mock:8081${BASE}/userCollectionPlaylists/me/relationships/items?include=items&page[size]=${limit}&page[offset]=${offset}`,
      next: hasNext
        ? `http://tidal-mock:8081${BASE}/userCollectionPlaylists/me/relationships/items?include=items&page[size]=${limit}&page[offset]=${nextOffset}`
        : null,
    },
  });
});

app.get(`${BASE}/playlists/:playlistId`, (req, res) => {
  const playlist = getPlaylistOr404(req.params.playlistId, res);
  if (!playlist) {
    return;
  }

  res.json({
    data: buildPlaylistResource(playlist),
    included: buildPlaylistIncluded(playlist),
  });
});

app.get(`${BASE}/playlists/:playlistId/relationships/items`, (req, res) => {
  const playlist = getPlaylistOr404(req.params.playlistId, res);
  if (!playlist) {
    return;
  }

  const entries = playlistItems.get(playlist.id) ?? [];
  const identifiers = entries.map((entry) => ({
    id: entry.trackId,
    type: 'tracks',
    meta: {
      itemId: entry.itemId,
      addedAt: entry.addedAt,
    },
  }));

  const included = buildTrackIncluded(entries.map((entry) => entry.trackId));

  res.json({
    data: identifiers,
    included,
    links: {
      self: `http://tidal-mock:8081${BASE}/playlists/${playlist.id}/relationships/items?include=items`,
      next: null,
    },
  });
});

app.post(`${BASE}/playlists/:playlistId/relationships/items`, (req, res) => {
  const playlist = getPlaylistOr404(req.params.playlistId, res);
  if (!playlist) {
    return;
  }

  const entries = playlistItems.get(playlist.id) ?? [];
  const payload = Array.isArray(req.body?.data) ? req.body.data : [];

  for (const identifier of payload) {
    const trackId = identifier?.id;
    if (typeof trackId !== 'string' || !tracksFixture[trackId]) {
      continue;
    }

    entries.push({
      trackId,
      itemId: generateItemId(),
      addedAt: nowIso(),
    });
  }

  playlistItems.set(playlist.id, entries);
  res.status(200).json({ data: [] });
});

app.delete(`${BASE}/playlists/:playlistId/relationships/items`, (req, res) => {
  const playlist = getPlaylistOr404(req.params.playlistId, res);
  if (!playlist) {
    return;
  }

  const currentEntries = playlistItems.get(playlist.id) ?? [];
  const payload = Array.isArray(req.body?.data) ? req.body.data : [];

  const removableTrackIds = new Set();
  const removableItemIds = new Set();

  for (const identifier of payload) {
    if (typeof identifier?.id === 'string') {
      removableTrackIds.add(identifier.id);
    }

    if (typeof identifier?.meta?.itemId === 'string') {
      removableItemIds.add(identifier.meta.itemId);
    }
  }

  const nextEntries = currentEntries.filter((entry) => {
    if (removableItemIds.has(entry.itemId)) {
      return false;
    }

    if (removableTrackIds.has(entry.trackId)) {
      return false;
    }

    return true;
  });

  playlistItems.set(playlist.id, nextEntries);
  res.status(200).json({ data: [] });
});

app.patch(`${BASE}/playlists/:playlistId`, (req, res) => {
  const playlist = getPlaylistOr404(req.params.playlistId, res);
  if (!playlist) {
    return;
  }

  const attributes = req.body?.data?.attributes ?? {};
  if (typeof attributes.name === 'string') {
    playlist.name = attributes.name;
  }
  if (typeof attributes.description === 'string') {
    playlist.description = attributes.description;
  }
  if (typeof attributes.accessType === 'string') {
    playlist.accessType = attributes.accessType;
  }

  playlists.set(playlist.id, playlist);
  res.status(200).json({ data: buildPlaylistResource(playlist) });
});

app.post(`${BASE}/playlists`, (req, res) => {
  const attributes = req.body?.data?.attributes ?? {};
  const id = `tidal-playlist-${Date.now()}`;

  const playlist = {
    id,
    name: typeof attributes.name === 'string' ? attributes.name : 'New TIDAL Playlist',
    description: typeof attributes.description === 'string' ? attributes.description : '',
    accessType: attributes.accessType === 'PUBLIC' ? 'PUBLIC' : 'UNLISTED',
    ownerId: userFixture.id,
    ownerUsername: userFixture.username,
    coverUrl: 'https://tidal-mock.local/images/tidal-created-playlist.jpg',
    collaborative: false,
  };

  playlists.set(id, playlist);
  playlistItems.set(id, []);

  res.status(201).json({
    data: buildPlaylistResource(playlist),
    included: buildPlaylistIncluded(playlist),
  });
});

app.get(`${BASE}/userCollectionTracks/me/relationships/items`, (req, res) => {
  const limit = safeLimit(req.query['page[size]']);
  const offset = safeOffset(req.query['page[offset]']);
  const allTrackIds = Array.from(userCollectionTrackIds);
  const pageTrackIds = allTrackIds.slice(offset, offset + limit);

  const data = pageTrackIds.map((trackId) => ({ id: trackId, type: 'tracks' }));
  const included = buildTrackIncluded(pageTrackIds);

  const nextOffset = offset + limit;
  const hasNext = nextOffset < allTrackIds.length;

  res.json({
    data,
    included,
    links: {
      self: `http://tidal-mock:8081${BASE}/userCollectionTracks/me/relationships/items?include=items&page[size]=${limit}&page[offset]=${offset}`,
      next: hasNext
        ? `http://tidal-mock:8081${BASE}/userCollectionTracks/me/relationships/items?include=items&page[size]=${limit}&page[offset]=${nextOffset}`
        : null,
    },
  });
});

app.post(`${BASE}/userCollectionTracks/me/relationships/items`, (req, res) => {
  const payload = Array.isArray(req.body?.data) ? req.body.data : [];
  for (const identifier of payload) {
    if (typeof identifier?.id === 'string') {
      userCollectionTrackIds.add(identifier.id);
    }
  }

  res.status(200).json({ data: [] });
});

app.delete(`${BASE}/userCollectionTracks/me/relationships/items`, (req, res) => {
  const payload = Array.isArray(req.body?.data) ? req.body.data : [];
  for (const identifier of payload) {
    if (typeof identifier?.id === 'string') {
      userCollectionTrackIds.delete(identifier.id);
    }
  }

  res.status(200).json({ data: [] });
});

app.get(`${BASE}/searchResults/:query/relationships/tracks`, (req, res) => {
  const query = String(req.params.query ?? '').toLowerCase();
  const matchedTrackIds = Object.entries(tracksFixture)
    .filter(([, track]) => String(track.title ?? '').toLowerCase().includes(query))
    .slice(0, 20)
    .map(([trackId]) => trackId);

  res.json({
    data: matchedTrackIds.map((trackId) => ({ id: trackId, type: 'tracks' })),
    included: buildTrackIncluded(matchedTrackIds),
    links: {
      self: `http://tidal-mock:8081${BASE}/searchResults/${encodeURIComponent(req.params.query)}/relationships/tracks?include=tracks`,
      next: null,
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tidal-mock' });
});

app.use((req, res) => {
  res.status(404).json({
    errors: [{
      detail: `Mock endpoint not found: ${req.method} ${req.path}`,
    }],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.debug(`[mock-tidal] Mock TIDAL API listening on http://0.0.0.0:${PORT}`);
});
