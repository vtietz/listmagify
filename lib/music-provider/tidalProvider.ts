import {
  ProviderApiError,
  type AddTracksPayload,
  type CreatePlaylistPayload,
  type CurrentUserResult,
  type LikedTracksPageResult,
  type MusicProvider,
  type PlaybackDevice,
  type PlaybackState,
  type Playlist,
  type PlaylistPageResult,
  type PlaylistPermissionsResult,
  type PlaylistTracksPageResult,
  type ProviderClientOptions,
  type PublicUserProfileResult,
  type ReorderTracksPayload,
  type Track,
  type TrackSavePayload,
  type TrackSearchResult,
  type UpdatePlaylistPayload,
} from '@/lib/music-provider/types';
import {
  applyReorder,
  buildIncludedIndex,
  buildJsonApiDataPayload,
  dedupeTrackIds,
  fromTrackUri,
  mapPlaylistResource,
  mapTrackListDocument,
  mapUserResource,
  MAX_BATCH_SIZE,
  toTrackUri,
  type JsonApiDocument,
  type JsonApiIdentifier,
  type JsonApiResource,
} from '@/lib/music-provider/tidalProviderHelpers';
import { createTidalTransport, type TidalProviderDependencies } from '@/lib/music-provider/tidalTransport';

const DEFAULT_PROVIDER_ID = 'tidal';

function unsupported(operation: string): never {
  throw new ProviderApiError(`${operation} is not supported for TIDAL`, 501, DEFAULT_PROVIDER_ID);
}

function makeSnapshotId(): string {
  return `tidal-${Date.now()}`;
}

async function readErrorText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}

function throwProviderError(response: Response, details: string, operation: string): never {
  throw new ProviderApiError(
    `${operation} failed: ${response.status} ${response.statusText}`,
    response.status,
    DEFAULT_PROVIDER_ID,
    details,
  );
}

function toRelationArray(data: unknown): JsonApiIdentifier[] {
  if (!data) {
    return [];
  }

  return Array.isArray(data) ? data : [data as JsonApiIdentifier];
}

export function createTidalProvider(dependencies: TidalProviderDependencies = {}): MusicProvider {
  const transport = createTidalTransport(dependencies);

  async function appendPlaylistTracks(playlistId: string, trackIds: string[]): Promise<void> {
    const path = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`;

    for (let i = 0; i < trackIds.length; i += MAX_BATCH_SIZE) {
      const batch = trackIds.slice(i, i + MAX_BATCH_SIZE);
      const response = await transport.executeWithSession(
        path,
        {
          method: 'POST',
          body: JSON.stringify({ data: batch.map((trackId) => ({ id: trackId, type: 'tracks' })) }),
        },
        undefined,
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'appendPlaylistTracks');
      }
    }
  }

  return {
    async saveTracks(payload: TrackSavePayload): Promise<void> {
      const trackIds = dedupeTrackIds(payload.ids);
      if (trackIds.length === 0) {
        return;
      }

      const response = await transport.executeWithSession(
        '/userCollectionTracks/me/relationships/items',
        { method: 'POST', body: buildJsonApiDataPayload(trackIds.map((id) => ({ id, type: 'tracks' }))) },
        undefined,
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'saveTracks');
      }
    },

    async removeTracks(payload: TrackSavePayload): Promise<void> {
      const trackIds = dedupeTrackIds(payload.ids);
      if (trackIds.length === 0) {
        return;
      }

      const response = await transport.executeWithSession(
        '/userCollectionTracks/me/relationships/items',
        { method: 'DELETE', body: buildJsonApiDataPayload(trackIds.map((id) => ({ id, type: 'tracks' }))) },
        undefined,
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'removeTracks');
      }
    },

    async containsTracks(payload: TrackSavePayload): Promise<boolean[]> {
      const targetIds = dedupeTrackIds(payload.ids);
      if (targetIds.length === 0) {
        return [];
      }

      const targetSet = new Set(targetIds);
      const foundIds = new Set<string>();
      let nextCursor: string | null = null;
      let guard = 0;

      do {
        const path = nextCursor ?? '/userCollectionTracks/me/relationships/items?include=items';
        const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
        if (!response.ok) {
          throwProviderError(response, await readErrorText(response), 'containsTracks');
        }

        const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
        const identifiers = Array.isArray(raw.data) ? raw.data : [];
        for (const identifier of identifiers) {
          if (identifier.type === 'tracks' && targetSet.has(identifier.id)) {
            foundIds.add(identifier.id);
          }
        }

        if (foundIds.size === targetIds.length) {
          break;
        }

        nextCursor = raw.links?.next ?? null;
        guard += 1;
      } while (nextCursor && guard < 500);

      return payload.ids.map((id) => foundIds.has(fromTrackUri(id)));
    },

    async getLikedTracks(limit = 50, nextCursor?: string | null): Promise<LikedTracksPageResult<Track>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 100);
      const basePath = `/userCollectionTracks/me/relationships/items?include=items&page[size]=${boundedLimit}`;
      const path = nextCursor ?? basePath;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getLikedTracks');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      const page = mapTrackListDocument(raw);
      return { tracks: page.tracks, total: page.total, nextCursor: page.nextCursor };
    },

    async searchTracks(query: string, _limit = 50, offset = 0): Promise<TrackSearchResult<Track>> {
      if (offset > 0) {
        return { tracks: [], total: 0, nextOffset: null };
      }

      const path = `/searchResults/${encodeURIComponent(query)}/relationships/tracks?include=tracks`;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'searchTracks');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      const page = mapTrackListDocument(raw);
      return { tracks: page.tracks, total: page.tracks.length, nextOffset: null };
    },

    async getCurrentUser(): Promise<CurrentUserResult> {
      const response = await transport.executeWithSession('/users/me', { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getCurrentUser');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiResource>;
      return mapUserResource(raw.data);
    },

    async getUserProfile(userId: string): Promise<PublicUserProfileResult> {
      const response = await transport.executeWithSession(
        `/users/${encodeURIComponent(userId)}`,
        { method: 'GET' },
        undefined,
      );
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getUserProfile');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiResource>;
      const mapped = mapUserResource(raw.data);
      return { id: mapped.id, displayName: mapped.displayName, imageUrl: null, ...(mapped.email ? { email: mapped.email } : {}) };
    },

    async getPlaylistPermissions(playlistId: string): Promise<PlaylistPermissionsResult> {
      const response = await transport.executeWithSession(
        `/playlists/${encodeURIComponent(playlistId)}?include=owners,collaborators`,
        { method: 'GET' },
        undefined,
      );
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getPlaylistPermissions');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiResource>;
      const owners = toRelationArray(raw.data.relationships?.owners?.data);
      const collaborators = toRelationArray(raw.data.relationships?.collaborators?.data);
      return { ownerId: owners[0]?.id ?? null, collaborative: collaborators.length > 0 };
    },

    async getPlaylistDetails(playlistId: string, _fields?: string): Promise<Playlist> {
      const response = await transport.executeWithSession(
        `/playlists/${encodeURIComponent(playlistId)}?include=owners,coverArt,collaborators`,
        { method: 'GET' },
        undefined,
      );
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getPlaylistDetails');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiResource>;
      return mapPlaylistResource(raw.data, buildIncludedIndex(raw.included));
    },

    async createPlaylist(payload: CreatePlaylistPayload): Promise<Playlist> {
      const requestPayload = {
        data: {
          type: 'playlists',
          attributes: { name: payload.name, description: payload.description, accessType: payload.isPublic ? 'PUBLIC' : 'UNLISTED' },
        },
      };

      const response = await transport.executeWithSession('/playlists', { method: 'POST', body: JSON.stringify(requestPayload) }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'createPlaylist');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiResource>;
      return mapPlaylistResource(raw.data, buildIncludedIndex(raw.included));
    },

    async updatePlaylistDetails(playlistId: string, payload: UpdatePlaylistPayload): Promise<void> {
      const attributes: Record<string, unknown> = {};
      if (typeof payload.name === 'string') {
        attributes.name = payload.name;
      }
      if (typeof payload.description === 'string') {
        attributes.description = payload.description;
      }
      if (typeof payload.public === 'boolean') {
        attributes.accessType = payload.public ? 'PUBLIC' : 'UNLISTED';
      }

      const requestPayload = { data: { id: playlistId, type: 'playlists', attributes } };
      const response = await transport.executeWithSession(
        `/playlists/${encodeURIComponent(playlistId)}`,
        { method: 'PATCH', body: JSON.stringify(requestPayload) },
        undefined,
      );

      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'updatePlaylistDetails');
      }
    },

    async getPlaylistTrackUris(playlistId: string): Promise<string[]> {
      const references = await transport.fetchAllPlaylistItemReferences(playlistId);
      return references.filter((reference) => reference.type === 'tracks').map((reference) => toTrackUri(reference.id));
    },

    async replacePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }> {
      const existingReferences = await transport.fetchAllPlaylistItemReferences(playlistId);
      const removable = existingReferences
        .filter((reference) => reference.type === 'tracks' && reference.itemId)
        .map((reference) => ({ id: reference.id, type: 'tracks', meta: { itemId: reference.itemId } }));

      if (removable.length > 0) {
        const deleteResponse = await transport.executeWithSession(
          `/playlists/${encodeURIComponent(playlistId)}/relationships/items`,
          { method: 'DELETE', body: JSON.stringify({ data: removable }) },
          undefined,
        );
        if (!deleteResponse.ok) {
          throwProviderError(deleteResponse, await readErrorText(deleteResponse), 'replacePlaylistTracks');
        }
      }

      const trackIds = trackUris.map(fromTrackUri);
      if (trackIds.length > 0) {
        await appendPlaylistTracks(playlistId, trackIds);
      }

      return { snapshotId: makeSnapshotId() };
    },

    async removePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }> {
      const trackIds = new Set(trackUris.map(fromTrackUri));
      if (trackIds.size === 0) {
        return { snapshotId: makeSnapshotId() };
      }

      const allReferences = await transport.fetchAllPlaylistItemReferences(playlistId);
      const toRemove = allReferences
        .filter((reference) => reference.type === 'tracks' && trackIds.has(reference.id) && reference.itemId)
        .map((reference) => ({ id: reference.id, type: 'tracks', meta: { itemId: reference.itemId } }));

      if (toRemove.length === 0) {
        return { snapshotId: makeSnapshotId() };
      }

      const response = await transport.executeWithSession(
        `/playlists/${encodeURIComponent(playlistId)}/relationships/items`,
        { method: 'DELETE', body: JSON.stringify({ data: toRemove }) },
        undefined,
      );
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'removePlaylistTracks');
      }

      return { snapshotId: makeSnapshotId() };
    },

    async getPlaybackState(): Promise<PlaybackState | null> {
      unsupported('getPlaybackState');
    },

    async getPlaybackDevices(): Promise<PlaybackDevice[]> {
      unsupported('getPlaybackDevices');
    },

    async addTracks(payload: AddTracksPayload): Promise<{ snapshotId: string }> {
      const trackIds = payload.trackUris.map(fromTrackUri);
      if (trackIds.length === 0) {
        return { snapshotId: makeSnapshotId() };
      }

      if (typeof payload.position === 'number') {
        const existingTrackUris = await this.getPlaylistTrackUris(payload.playlistId);
        const boundedPosition = Math.max(0, Math.min(payload.position, existingTrackUris.length));
        const nextTrackUris = [...existingTrackUris];
        nextTrackUris.splice(boundedPosition, 0, ...payload.trackUris);
        return this.replacePlaylistTracks(payload.playlistId, nextTrackUris);
      }

      await appendPlaylistTracks(payload.playlistId, trackIds);
      return { snapshotId: makeSnapshotId() };
    },

    async reorderTracks(payload: ReorderTracksPayload): Promise<{ snapshotId: string }> {
      const currentTrackUris = await this.getPlaylistTrackUris(payload.playlistId);
      let nextTrackUris: string[];

      try {
        nextTrackUris = applyReorder(
          currentTrackUris,
          payload.fromIndex,
          payload.toIndex,
          typeof payload.rangeLength === 'number' ? payload.rangeLength : 1,
        );
      } catch {
        throw new ProviderApiError('reorderTracks failed: invalid indexes', 400, DEFAULT_PROVIDER_ID);
      }

      return this.replacePlaylistTracks(payload.playlistId, nextTrackUris);
    },

    async getUserPlaylists(limit = 50, nextCursor?: string | null): Promise<PlaylistPageResult<Playlist>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 100);
      const basePath = `/userCollectionPlaylists/me/relationships/items?include=items&page[size]=${boundedLimit}`;
      const path = nextCursor ?? basePath;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readErrorText(response), 'getUserPlaylists');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      const includedIndex = buildIncludedIndex(raw.included);
      const identifiers = Array.isArray(raw.data) ? raw.data : [];
      const items: Playlist[] = [];

      for (const identifier of identifiers) {
        if (identifier.type !== 'playlists') {
          continue;
        }

        const playlistResource = includedIndex.get(`${identifier.type}:${identifier.id}`);
        if (playlistResource) {
          items.push(mapPlaylistResource(playlistResource, includedIndex));
        }
      }

      return { items, nextCursor: raw.links?.next ?? null, total: items.length };
    },

    async getPlaylistTracks(
      playlistId: string,
      _limit = 100,
      nextCursor?: string | null,
    ): Promise<PlaylistTracksPageResult<Track>> {
      const raw = await transport.fetchPlaylistItemsPage(playlistId, nextCursor);
      return mapTrackListDocument(raw);
    },

    async fetch(path: string, init?: RequestInit, opts?: ProviderClientOptions): Promise<Response> {
      return transport.executeWithSession(path, init, opts);
    },

    async fetchWithToken(
      accessToken: string,
      path: string,
      init?: RequestInit,
      opts?: ProviderClientOptions,
    ): Promise<Response> {
      return transport.executeWithAccessToken(accessToken, path, init, opts);
    },

    async getJSON<T>(path: string, opts?: ProviderClientOptions): Promise<T> {
      const response = await transport.executeWithSession(path, { method: 'GET' }, opts);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`[tidal] GET ${path} failed: ${response.status} ${response.statusText} ${text}`);
      }

      return response.json() as Promise<T>;
    },
  };
}
