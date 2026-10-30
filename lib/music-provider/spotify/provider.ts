import {
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
  type PositionedTrackRemoval,
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
  executeWithAccessToken,
  executeWithSession,
  readErrorText,
  resolveSpotifyDependencies,
  throwProviderError,
  type SpotifyProviderDependencies,
} from '@/lib/music-provider/spotify/http';
import {
  PLAYLIST_ITEMS_PAGE_LIMIT,
  buildTracksPath,
  mapCurrentUser,
  mapPlaylistTracksPage,
  mapPublicUser,
  playlistItemsPath,
  requireSnapshotId,
} from '@/lib/music-provider/spotify/mappers';
import {
  mapAlbumTracks,
  mapSearchAlbums,
  mapSearchArtists,
  mapSearchTracks,
} from '@/lib/music-provider/spotify/searchMappers';
import {
  batchAddTracks,
  batchRemovePlaylistTracks,
  batchReplacePlaylistTracks,
  fetchPlaylistTrackUris,
  removePlaylistTracksAtPositions,
} from '@/lib/music-provider/spotify/batchOperations';

/** /search `limit` maximum (reduced from 50 to 10 in Feb 2026). */
const SEARCH_LIMIT_MAX = 10;

/** Max URIs per /me/library request. */
const LIBRARY_BATCH_SIZE = 40;

type ResolvedSpotifyDependencies = ReturnType<typeof resolveSpotifyDependencies>;

function chunk<T>(values: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    batches.push(values.slice(i, i + size));
  }
  return batches;
}

function toTrackUris(ids: string[]): string[] {
  return ids.map((id) => (id.startsWith('spotify:') ? id : `spotify:track:${id}`));
}

async function sendLibraryRequest(
  method: 'PUT' | 'DELETE',
  uris: string[],
  operation: string,
  deps: ResolvedSpotifyDependencies
): Promise<void> {
  for (const batch of chunk(uris, LIBRARY_BATCH_SIZE)) {
    const response = await executeWithSession(
      `/me/library?uris=${batch.map(encodeURIComponent).join(',')}`,
      { method },
      undefined,
      deps
    );

    if (!response.ok) {
      throwProviderError(response, await readErrorText(response), operation);
    }
  }
}

export function createSpotifyProvider(
  dependencies: SpotifyProviderDependencies = {}
): MusicProvider {
  const deps = resolveSpotifyDependencies(dependencies);

  return {
    async saveTracks(payload: TrackSavePayload): Promise<void> {
      await sendLibraryRequest('PUT', toTrackUris(payload.ids), 'saveTracks', deps);
    },

    async removeTracks(payload: TrackSavePayload): Promise<void> {
      await sendLibraryRequest('DELETE', toTrackUris(payload.ids), 'removeTracks', deps);
    },

    async containsTracks(payload: TrackSavePayload): Promise<boolean[]> {
      const uris = toTrackUris(payload.ids);
      const results: boolean[] = [];

      for (const batch of chunk(uris, LIBRARY_BATCH_SIZE)) {
        const response = await executeWithSession(
          `/me/library/contains?uris=${batch.map(encodeURIComponent).join(',')}`,
          { method: 'GET' },
          undefined,
          deps
        );

        if (!response.ok) {
          throwProviderError(response, await readErrorText(response), 'containsTracks');
        }

        const flags = await response.json();
        results.push(...(Array.isArray(flags) ? flags.map((flag) => flag === true) : batch.map(() => false)));
      }

      return results;
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

    async searchTracks(query: string, limit = SEARCH_LIMIT_MAX, offset = 0): Promise<TrackSearchResult<Track>> {
      const boundedLimit = Math.min(Math.max(limit, 1), SEARCH_LIMIT_MAX);
      const boundedOffset = Math.max(offset, 0);
      const path = `/search?q=${encodeURIComponent(query)}&type=track&limit=${boundedLimit}&offset=${boundedOffset}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'searchTracks');
      }

      const raw = await response.json();
      return mapSearchTracks(raw, boundedOffset);
    },

    async getTrackByIsrc(isrc: string): Promise<Track | null> {
      const path = `/search?q=${encodeURIComponent(`isrc:${isrc}`)}&type=track&limit=1`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getTrackByIsrc');
      }

      const raw = await response.json();
      const result = mapSearchTracks(raw, 0);
      return result.tracks[0] ?? null;
    },

    async searchArtists(query: string, limit = SEARCH_LIMIT_MAX, offset = 0): Promise<ArtistSearchResult> {
      const boundedLimit = Math.min(Math.max(limit, 1), SEARCH_LIMIT_MAX);
      const boundedOffset = Math.max(offset, 0);
      const path = `/search?q=${encodeURIComponent(query)}&type=artist&limit=${boundedLimit}&offset=${boundedOffset}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'searchArtists');
      }

      const raw = await response.json();
      return mapSearchArtists(raw, boundedOffset);
    },

    async searchAlbums(query: string, limit = SEARCH_LIMIT_MAX, offset = 0): Promise<AlbumSearchResult> {
      const boundedLimit = Math.min(Math.max(limit, 1), SEARCH_LIMIT_MAX);
      const boundedOffset = Math.max(offset, 0);
      const path = `/search?q=${encodeURIComponent(query)}&type=album&limit=${boundedLimit}&offset=${boundedOffset}`;
      const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'searchAlbums');
      }

      const raw = await response.json();
      return mapSearchAlbums(raw, boundedOffset);
    },

    // GET /artists/{id}/top-tracks was removed (Feb 2026): approximate with an
    // artist-scoped track search filtered to tracks credited to this artist.
    async getArtistTopTracks(artistId: string): Promise<Track[]> {
      const artistResponse = await executeWithSession(
        `/artists/${encodeURIComponent(artistId)}`,
        { method: 'GET' },
        undefined,
        deps
      );

      if (!artistResponse.ok) {
        throwProviderError(artistResponse, await readErrorText(artistResponse), 'getArtistTopTracks');
      }

      const artist = await artistResponse.json();
      const artistName = typeof artist?.name === 'string' ? artist.name : '';
      if (!artistName) {
        return [];
      }

      const query = encodeURIComponent(`artist:"${artistName.replace(/"/g, '')}"`);
      const response = await executeWithSession(
        `/search?q=${query}&type=track&limit=${SEARCH_LIMIT_MAX}`,
        { method: 'GET' },
        undefined,
        deps
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getArtistTopTracks');
      }

      const { tracks } = mapSearchTracks(await response.json(), 0);
      return tracks.filter((track) => track.artistObjects?.some((entry) => entry.id === artistId) ?? true);
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

    // GET /users/{id} was removed (Feb 2026); only the current user's profile is readable.
    async getUserProfile(userId: string): Promise<PublicUserProfileResult> {
      const response = await executeWithSession('/me', { method: 'GET' }, undefined, deps);

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getUserProfile');
      }

      const me = await response.json();
      if (me?.id !== userId) {
        return { id: userId, displayName: null, imageUrl: null };
      }

      return mapPublicUser(me, userId);
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
      const path = '/me/playlists';
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

    // Unfollowing a playlist (Spotify's "delete") now goes through /me/library.
    async deletePlaylist(playlistId: string): Promise<void> {
      await sendLibraryRequest('DELETE', [`spotify:playlist:${playlistId}`], 'deletePlaylist', deps);
    },

    async getPlaylistTrackUris(playlistId: string): Promise<string[]> {
      return fetchPlaylistTrackUris(playlistId, deps);
    },

    async replacePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }> {
      return batchReplacePlaylistTracks(playlistId, trackUris, deps);
    },

    async removePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }> {
      return batchRemovePlaylistTracks(playlistId, trackUris, deps);
    },

    async removePlaylistTracksAtPositions(
      playlistId: string,
      expected: PositionedTrackRemoval[]
    ): Promise<{ snapshotId: string }> {
      return removePlaylistTracksAtPositions(playlistId, expected, deps);
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
      return batchAddTracks(payload, deps);
    },

    async reorderTracks(payload: ReorderTracksPayload): Promise<{ snapshotId: string }> {
      const path = playlistItemsPath(payload.playlistId);
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
      limit = PLAYLIST_ITEMS_PAGE_LIMIT,
      nextCursor?: string | null
    ): Promise<PlaylistTracksPageResult<Track>> {
      const boundedLimit = Math.min(Math.max(limit, 1), PLAYLIST_ITEMS_PAGE_LIMIT);
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
