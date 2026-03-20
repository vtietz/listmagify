import { getManagedSession } from '@/lib/auth/tokenManager';
import { ServerAuthError } from '@/lib/auth/requireAuth';
import { withRateLimitRetry } from '@/lib/spotify/rateLimit';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';
import {
  ProviderApiError,
  type AddTracksPayload,
  type CreatePlaylistPayload,
  type CurrentUserResult,
  type PlaybackDevice,
  type PlaybackState,
  type Playlist,
  type Track,
  type LikedTracksPageResult,
  type MusicProvider,
  type PlaylistPageResult,
  type PlaylistPermissionsResult,
  type PlaylistTracksPageResult,
  type PublicUserProfileResult,
  type ProviderClientOptions,
  type ReorderTracksPayload,
  type TrackSavePayload,
  type TrackSearchResult,
  type ArtistSearchResult,
  type AlbumSearchResult,
  type SearchArtistResult,
  type SearchAlbumResult,
  type Image,
  type UpdatePlaylistPayload,
} from '@/lib/music-provider/types';
import { mapDevice, mapPlaybackState } from '@/lib/spotify/playerTypes';
import { mapPlaylist, mapPlaylistItemToTrack, pageFromSpotify } from '@/lib/spotify/types';

type SpotifyProviderDependencies = {
  fetchImpl?: typeof fetch;
  getSession?: () => Promise<AuthenticatedSession>;
};

const DEFAULT_BASE = 'https://api.spotify.com/v1';
const DEFAULT_PROVIDER_ID = 'spotify';
const REAL_SPOTIFY_HOSTS = new Set(['api.spotify.com', 'accounts.spotify.com']);

function getEffectiveBaseUrl(): string {
  if (process.env.E2E_MODE === '1') {
    return process.env.SPOTIFY_BASE_URL ?? 'http://spotify-mock:8080/v1';
  }

  return DEFAULT_BASE;
}

function getSafeRequestPath(path: string): string {
  try {
    if (path.startsWith('http')) {
      return new URL(path).pathname;
    }

    return path.split('?')[0] ?? path;
  } catch {
    return path.split('?')[0] ?? path;
  }
}

function buildUrl(path: string, baseUrl?: string): string {
  const resolvedUrl = path.startsWith('http')
    ? path
    : `${baseUrl ?? getEffectiveBaseUrl()}${path}`;

  if (process.env.E2E_MODE === '1') {
    try {
      const hostname = new URL(resolvedUrl).hostname;
      if (REAL_SPOTIFY_HOSTS.has(hostname)) {
        throw new Error(`[spotify] Real Spotify host is blocked in E2E mode: ${resolvedUrl}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('blocked in E2E mode')) {
        throw error;
      }
    }
  }

  return resolvedUrl;
}

function buildHeaders(token: string, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

async function executeWithSession(
  path: string,
  init: RequestInit | undefined,
  opts: ProviderClientOptions | undefined,
  deps: Required<SpotifyProviderDependencies>
): Promise<Response> {
  const url = buildUrl(path, opts?.baseUrl);
  const safePath = getSafeRequestPath(path);

  const runAttempt = async (): Promise<Response> => {
    let session: AuthenticatedSession;
    try {
      session = await deps.getSession();
    } catch (error) {
      if (error instanceof ServerAuthError) {
        throw new ProviderApiError('Authentication required', 401, DEFAULT_PROVIDER_ID, error.reason);
      }

      throw error;
    }

    const headers = buildHeaders(session.accessToken, init?.headers);

    return withRateLimitRetry(
      () =>
        deps.fetchImpl(url, {
          ...init,
          headers,
        }),
      opts?.backoff,
      safePath
    );
  };

  const first = await runAttempt();
  if (first.status !== 401) {
    return first;
  }

  // Retry once after reacquiring session/token; handles short-lived race windows.
  return runAttempt();
}

async function executeWithAccessToken(
  accessToken: string,
  path: string,
  init?: RequestInit,
  opts?: ProviderClientOptions,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const url = buildUrl(path, opts?.baseUrl);
  const safePath = getSafeRequestPath(path);
  const headers = buildHeaders(accessToken, init?.headers);

  return withRateLimitRetry(
    () =>
      fetchImpl(url, {
        ...init,
        headers,
      }),
    opts?.backoff,
    safePath
  );
}

async function readErrorText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}

function throwProviderError(response: Response, details: string, operation: string): never {
  throw new ProviderApiError(
    `${operation} failed: ${response.status} ${response.statusText}`,
    response.status,
    DEFAULT_PROVIDER_ID,
    details
  );
}

function buildTracksPath(playlistId: string, limit: number, nextCursor?: string | null): string {
  const fields = 'items(track(id,uri,name,artists(name),duration_ms,album(id,name,images,release_date,release_date_precision),popularity),added_at,added_by(id,display_name)),next,total,snapshot_id';
  if (!nextCursor) {
    return `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&fields=${encodeURIComponent(fields)}`;
  }

  try {
    const url = new URL(nextCursor);
    const offset = url.searchParams.get('offset') || '0';
    const parsedLimit = url.searchParams.get('limit') || String(limit);
    return `/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${parsedLimit}&fields=${encodeURIComponent(fields)}`;
  } catch {
    return nextCursor.includes('fields=') ? nextCursor : `${nextCursor}&fields=${encodeURIComponent(fields)}`;
  }
}

function mapCurrentUser(raw: any): CurrentUserResult {
  return {
    id: String(raw?.id ?? ''),
    displayName: typeof raw?.display_name === 'string' ? raw.display_name : null,
    ...(typeof raw?.email === 'string' ? { email: raw.email } : {}),
  };
}

function mapPublicUser(raw: any, fallbackId: string): PublicUserProfileResult {
  return {
    id: typeof raw?.id === 'string' && raw.id.length > 0 ? raw.id : fallbackId,
    displayName: typeof raw?.display_name === 'string' ? raw.display_name : null,
    imageUrl: typeof raw?.images?.[0]?.url === 'string' ? raw.images[0].url : null,
    ...(typeof raw?.email === 'string' ? { email: raw.email } : {}),
  };
}

async function requireSnapshotId(response: Response, operation: string): Promise<{ snapshotId: string }> {
  const result = await response.json();
  const snapshotId = result?.snapshot_id;
  if (!snapshotId || typeof snapshotId !== 'string') {
    throw new ProviderApiError(`${operation} failed: missing snapshot_id`, 500, DEFAULT_PROVIDER_ID);
  }

  return { snapshotId };
}

function extractOffsetFromCursor(nextCursor?: string | null): number {
  if (!nextCursor) {
    return 0;
  }

  try {
    const url = new URL(nextCursor);
    return parseInt(url.searchParams.get('offset') || '0', 10);
  } catch {
    return 0;
  }
}

function mapPlaylistTracksPage(raw: any, nextCursor?: string | null): PlaylistTracksPageResult<Track> {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const baseOffset = extractOffsetFromCursor(nextCursor);
  return {
    tracks: rawItems.map((item: any, index: number) => ({
      ...mapPlaylistItemToTrack(item),
      position: baseOffset + index,
    })),
    snapshotId: raw?.snapshot_id ?? null,
    total: typeof raw?.total === 'number' ? raw.total : rawItems.length,
    nextCursor: raw?.next ?? null,
  };
}

export function createSpotifyProvider(
  dependencies: SpotifyProviderDependencies = {}
): MusicProvider {
  const deps: Required<SpotifyProviderDependencies> = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    getSession: dependencies.getSession ?? (() => getManagedSession('spotify')),
  };

  return {
    async saveTracks(payload: TrackSavePayload): Promise<void> {
      const response = await executeWithSession(
        `/me/tracks?ids=${payload.ids.join(',')}`,
        { method: 'PUT' },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'saveTracks');
      }
    },

    async removeTracks(payload: TrackSavePayload): Promise<void> {
      const response = await executeWithSession(
        `/me/tracks?ids=${payload.ids.join(',')}`,
        { method: 'DELETE' },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'removeTracks');
      }
    },

    async containsTracks(payload: TrackSavePayload): Promise<boolean[]> {
      const response = await executeWithSession(
        `/me/tracks/contains?ids=${payload.ids.join(',')}`,
        { method: 'GET' },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'containsTracks');
      }

      return response.json() as Promise<boolean[]>;
    },

    async getLikedTracks(
      limit = 50,
      nextCursor?: string | null
    ): Promise<LikedTracksPageResult<Track>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 50);
      const path = nextCursor ?? `/me/tracks?limit=${boundedLimit}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getLikedTracks');
      }

      const raw = await response.json();
      const rawItems = Array.isArray(raw?.items) ? raw.items : [];

      return {
        tracks: rawItems.map((item: any) => mapPlaylistItemToTrack(item)),
        total: typeof raw?.total === 'number' ? raw.total : rawItems.length,
        nextCursor: raw?.next ?? null,
      };
    },

    async searchTracks(query: string, limit = 50, offset = 0): Promise<TrackSearchResult<Track>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 50);
      const boundedOffset = Math.max(offset, 0);
      const path = `/search?q=${encodeURIComponent(query)}&type=track&limit=${boundedLimit}&offset=${boundedOffset}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'searchTracks');
      }

      const raw = await response.json();
      const rawTracks = Array.isArray(raw?.tracks?.items) ? raw.tracks.items : [];
      const tracks = rawTracks.map((item: any) => mapPlaylistItemToTrack({ track: item }));
      const total = typeof raw?.tracks?.total === 'number' ? raw.tracks.total : 0;
      const nextOffset = boundedOffset + tracks.length < total ? boundedOffset + tracks.length : null;

      return { tracks, total, nextOffset };
    },

    async searchArtists(query: string, limit = 50, offset = 0): Promise<ArtistSearchResult> {
      const boundedLimit = Math.min(Math.max(limit, 1), 50);
      const boundedOffset = Math.max(offset, 0);
      const path = `/search?q=${encodeURIComponent(query)}&type=artist&limit=${boundedLimit}&offset=${boundedOffset}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'searchArtists');
      }

      const raw = await response.json();
      const rawArtists = Array.isArray(raw?.artists?.items) ? raw.artists.items : [];
      const artists: SearchArtistResult[] = rawArtists.map((item: any) => {
        const images = Array.isArray(item?.images) ? item.images : [];
        const image: Image | null =
          images.length > 0 && typeof images[0]?.url === 'string'
            ? { url: images[0].url, width: images[0].width ?? null, height: images[0].height ?? null }
            : null;
        return {
          id: String(item?.id ?? ''),
          name: String(item?.name ?? ''),
          image,
        };
      });
      const total = typeof raw?.artists?.total === 'number' ? raw.artists.total : 0;
      const nextOffset = boundedOffset + artists.length < total ? boundedOffset + artists.length : null;

      return { artists, total, nextOffset };
    },

    async searchAlbums(query: string, limit = 50, offset = 0): Promise<AlbumSearchResult> {
      const boundedLimit = Math.min(Math.max(limit, 1), 50);
      const boundedOffset = Math.max(offset, 0);
      const path = `/search?q=${encodeURIComponent(query)}&type=album&limit=${boundedLimit}&offset=${boundedOffset}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'searchAlbums');
      }

      const raw = await response.json();
      const rawAlbums = Array.isArray(raw?.albums?.items) ? raw.albums.items : [];
      const albums: SearchAlbumResult[] = rawAlbums.map((item: any) => {
        const images = Array.isArray(item?.images) ? item.images : [];
        const image: Image | null =
          images.length > 0 && typeof images[0]?.url === 'string'
            ? { url: images[0].url, width: images[0].width ?? null, height: images[0].height ?? null }
            : null;
        const artists = Array.isArray(item?.artists) ? item.artists : [];
        const artistName = typeof artists[0]?.name === 'string' ? artists[0].name : '';
        return {
          id: String(item?.id ?? ''),
          name: String(item?.name ?? ''),
          artistName,
          image,
          releaseDate: typeof item?.release_date === 'string' ? item.release_date : null,
        };
      });
      const total = typeof raw?.albums?.total === 'number' ? raw.albums.total : 0;
      const nextOffset = boundedOffset + albums.length < total ? boundedOffset + albums.length : null;

      return { albums, total, nextOffset };
    },

    async getArtistTopTracks(artistId: string): Promise<Track[]> {
      const path = `/artists/${encodeURIComponent(artistId)}/top-tracks`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getArtistTopTracks');
      }

      const raw = await response.json();
      const rawTracks = Array.isArray(raw?.tracks) ? raw.tracks : [];
      return rawTracks.map((item: any) => mapPlaylistItemToTrack({ track: item }));
    },

    async getAlbumTracks(albumId: string): Promise<Track[]> {
      const path = `/albums/${encodeURIComponent(albumId)}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getAlbumTracks');
      }

      const raw = await response.json();
      const albumInfo = {
        id: typeof raw?.id === 'string' ? raw.id : null,
        name: typeof raw?.name === 'string' ? raw.name : null,
        image: Array.isArray(raw?.images) && raw.images.length > 0 && typeof raw.images[0]?.url === 'string'
          ? { url: raw.images[0].url, width: raw.images[0].width ?? null, height: raw.images[0].height ?? null }
          : null,
        releaseDate: typeof raw?.release_date === 'string' ? raw.release_date : null,
      };
      const rawTracks = Array.isArray(raw?.tracks?.items) ? raw.tracks.items : [];
      return rawTracks.map((item: any) => {
        const track = mapPlaylistItemToTrack({ track: item });
        return {
          ...track,
          album: albumInfo,
        };
      });
    },

    async getCurrentUser(): Promise<CurrentUserResult> {
      const response = await executeWithSession('/me', { method: 'GET' }, undefined, deps);
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getCurrentUser');
      }

      return mapCurrentUser(await response.json());
    },

    async getUserProfile(userId: string): Promise<PublicUserProfileResult> {
      const response = await executeWithSession(
        `/users/${encodeURIComponent(userId)}`,
        { method: 'GET' },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getUserProfile');
      }

      return mapPublicUser(await response.json(), userId);
    },

    async getPlaylistPermissions(playlistId: string): Promise<PlaylistPermissionsResult> {
      const path = `/playlists/${encodeURIComponent(playlistId)}?fields=${encodeURIComponent('owner.id,collaborative')}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getPlaylistPermissions');
      }

      const raw = await response.json();
      return {
        ownerId: typeof raw?.owner?.id === 'string' ? raw.owner.id : null,
        collaborative: raw?.collaborative === true,
      };
    },

    async getPlaylistDetails(playlistId: string, fields?: string): Promise<Playlist> {
      const encodedFields = fields ? `?fields=${encodeURIComponent(fields)}` : '';
      const path = `/playlists/${encodeURIComponent(playlistId)}${encodedFields}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getPlaylistDetails');
      }

      return mapPlaylist(await response.json());
    },

    async createPlaylist(payload: CreatePlaylistPayload): Promise<Playlist> {
      const path = `/users/${encodeURIComponent(payload.userId)}/playlists`;
      const response = await executeWithSession(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.name,
            description: payload.description,
            public: payload.isPublic,
          }),
        },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'createPlaylist');
      }

      return mapPlaylist(await response.json());
    },

    async updatePlaylistDetails(playlistId: string, payload: UpdatePlaylistPayload): Promise<void> {
      const path = `/playlists/${encodeURIComponent(playlistId)}`;
      const response = await executeWithSession(
        path,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'updatePlaylistDetails');
      }
    },

    async getPlaylistTrackUris(playlistId: string): Promise<string[]> {
      const trackUris: string[] = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const path = `/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${limit}&fields=items(track(uri)),total`;
        const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

        if (!response.ok) {
          throwProviderError(response, await readErrorText(response), 'getPlaylistTrackUris');
        }

        const raw = await response.json();
        const items = Array.isArray(raw?.items) ? raw.items : [];
        const uris = items
          .map((item: any) => item?.track?.uri)
          .filter((uri: unknown): uri is string => typeof uri === 'string');
        trackUris.push(...uris);

        const total = typeof raw?.total === 'number' ? raw.total : trackUris.length;
        if (items.length < limit || trackUris.length >= total) {
          break;
        }

        offset += limit;
      }

      return trackUris;
    },

    async replacePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }> {
      const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;

      if (trackUris.length <= 100) {
        const response = await executeWithSession(
          path,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: trackUris }),
          },
          undefined,
          deps
        );

        if (!response.ok) {
          throwProviderError(response, await readErrorText(response), 'replacePlaylistTracks');
        }

        return requireSnapshotId(response, 'replacePlaylistTracks');
      }

      const clearResponse = await executeWithSession(
        path,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [] }),
        },
        undefined,
        deps
      );

      if (!clearResponse.ok) {
        throwProviderError(clearResponse, await readErrorText(clearResponse), 'replacePlaylistTracks');
      }

      let snapshotId: string | null = null;
      for (let i = 0; i < trackUris.length; i += 100) {
        const batch = trackUris.slice(i, i + 100);
        const addResponse = await executeWithSession(
          path,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: batch }),
          },
          undefined,
          deps
        );

        if (!addResponse.ok) {
          throwProviderError(addResponse, await readErrorText(addResponse), 'replacePlaylistTracks');
        }

        const result = await addResponse.json();
        snapshotId = result?.snapshot_id ?? snapshotId;
      }

      if (!snapshotId) {
        throw new ProviderApiError('replacePlaylistTracks failed: missing snapshot_id', 500, DEFAULT_PROVIDER_ID);
      }

      return { snapshotId };
    },

    async removePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }> {
      const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
      let snapshotId: string | null = null;

      for (let i = 0; i < trackUris.length; i += 100) {
        const batch = trackUris.slice(i, i + 100);
        const response = await executeWithSession(
          path,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tracks: batch.map((uri) => ({ uri })),
            }),
          },
          undefined,
          deps
        );

        if (!response.ok) {
          throwProviderError(response, await readErrorText(response), 'removePlaylistTracks');
        }

        const result = await response.json();
        snapshotId = result?.snapshot_id ?? snapshotId;
      }

      if (!snapshotId) {
        throw new ProviderApiError('removePlaylistTracks failed: missing snapshot_id', 500, DEFAULT_PROVIDER_ID);
      }

      return { snapshotId };
    },

    async getPlaybackState(): Promise<PlaybackState | null> {
      const response = await executeWithSession('/me/player', { method: 'GET' }, undefined, deps);
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getPlaybackState');
      }

      return mapPlaybackState(await response.json());
    },

    async getPlaybackDevices(): Promise<PlaybackDevice[]> {
      const response = await executeWithSession('/me/player/devices', { method: 'GET' }, undefined, deps);
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getPlaybackDevices');
      }

      const raw = await response.json();
      const devices = Array.isArray(raw?.devices) ? raw.devices : [];
      return devices.map((device: any) => mapDevice(device));
    },

    async addTracks(payload: AddTracksPayload): Promise<{ snapshotId: string }> {
      const path = `/playlists/${encodeURIComponent(payload.playlistId)}/tracks`;
      let snapshotId: string | null = null;
      let currentPosition = payload.position;

      for (let i = 0; i < payload.trackUris.length; i += 100) {
        const batch = payload.trackUris.slice(i, i + 100);
        const requestBody: Record<string, unknown> = { uris: batch };

        if (typeof currentPosition === 'number') {
          requestBody.position = currentPosition;
          currentPosition += batch.length;
        }

        if (snapshotId) {
          requestBody.snapshot_id = snapshotId;
        } else if (payload.snapshotId) {
          requestBody.snapshot_id = payload.snapshotId;
        }

        const response = await executeWithSession(
          path,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          undefined,
          deps
        );

        if (!response.ok) {
          throwProviderError(response, await readErrorText(response), 'addTracks');
        }

        const result = await response.json();
        snapshotId = result?.snapshot_id ?? snapshotId;
      }

      if (!snapshotId) {
        throw new ProviderApiError('addTracks failed: missing snapshot_id', 500, DEFAULT_PROVIDER_ID);
      }

      return { snapshotId };
    },

    async reorderTracks(payload: ReorderTracksPayload): Promise<{ snapshotId: string }> {
      const path = `/playlists/${encodeURIComponent(payload.playlistId)}/tracks`;
      const requestBody: Record<string, unknown> = {
        range_start: payload.fromIndex,
        insert_before: payload.toIndex,
        range_length: typeof payload.rangeLength === 'number' ? payload.rangeLength : 1,
        ...(payload.snapshotId ? { snapshot_id: payload.snapshotId } : {}),
      };

      const response = await executeWithSession(
        path,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'reorderTracks');
      }

      return requireSnapshotId(response, 'reorderTracks');
    },

    async getUserPlaylists(limit = 50, nextCursor?: string | null): Promise<PlaylistPageResult<Playlist>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 50);
      const path = nextCursor ?? `/me/playlists?limit=${boundedLimit}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getUserPlaylists');
      }

      const raw = await response.json();
      const page = pageFromSpotify(raw, mapPlaylist);
      return {
        items: page.items,
        nextCursor: page.nextCursor,
        total: typeof page.total === 'number' ? page.total : page.items.length,
      };
    },

    async getPlaylistTracks(
      playlistId: string,
      limit = 100,
      nextCursor?: string | null
    ): Promise<PlaylistTracksPageResult<Track>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 100);
      const path = buildTracksPath(playlistId, boundedLimit, nextCursor);
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getPlaylistTracks');
      }

      const raw = await response.json();
      return mapPlaylistTracksPage(raw, nextCursor);
    },

    async fetch(path: string, init?: RequestInit, opts?: ProviderClientOptions): Promise<Response> {
      return executeWithSession(path, init, opts, deps);
    },

    async fetchWithToken(
      accessToken: string,
      path: string,
      init?: RequestInit,
      opts?: ProviderClientOptions
    ): Promise<Response> {
      return executeWithAccessToken(accessToken, path, init, opts, deps.fetchImpl);
    },

    async getJSON<T>(path: string, opts?: ProviderClientOptions): Promise<T> {
      const response = await executeWithSession(path, { method: 'GET' }, opts, deps);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`[spotify] GET ${path} failed: ${response.status} ${response.statusText} ${text}`);
      }

      return response.json() as Promise<T>;
    },
  };
}
