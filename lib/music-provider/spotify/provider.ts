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
  type UpdatePlaylistPayload,
} from '@/lib/music-provider/types';
import { mapDevice, mapPlaybackState } from '@/lib/spotify/playerTypes';
import { mapPlaylist, mapPlaylistItemToTrack, pageFromSpotify } from '@/lib/spotify/types';
import {
  DEFAULT_PROVIDER_ID,
  executeWithAccessToken,
  executeWithSession,
  readErrorText,
  resolveSpotifyDependencies,
  throwProviderError,
  type SpotifyProviderDependencies,
} from '@/lib/music-provider/spotify/http';
import {
  buildTracksPath,
  mapCurrentUser,
  mapPlaylistTracksPage,
  mapPublicUser,
  requireSnapshotId,
} from '@/lib/music-provider/spotify/mappers';
import {
  mapAlbumTracks,
  mapSearchAlbums,
  mapSearchArtists,
  mapSearchTracks,
} from '@/lib/music-provider/spotify/searchMappers';

export function createSpotifyProvider(
  dependencies: SpotifyProviderDependencies = {}
): MusicProvider {
  const deps = resolveSpotifyDependencies(dependencies);

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
      return mapSearchTracks(raw, boundedOffset);
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
      return mapSearchArtists(raw, boundedOffset);
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
      return mapSearchAlbums(raw, boundedOffset);
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
      return mapAlbumTracks(raw);
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
