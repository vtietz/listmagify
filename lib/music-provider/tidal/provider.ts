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
  type ArtistSearchResult,
  type AlbumSearchResult,
  type UpdatePlaylistPayload,
} from '@/lib/music-provider/types';
import {
  applyReorderToTrackUris,
  buildNativeReorderPayload,
  buildIncludedIndex,
  buildJsonApiDataPayload,
  dedupeTrackIds,
  readJsonApiErrorDetails,
  fromTrackUri,
  toTrackUri,
  type JsonApiDocument,
  type JsonApiIdentifier,
  type JsonApiResource,
} from '@/lib/music-provider/tidal/jsonApi';
import {
  mapPlaylistResource,
  mapTrackListDocument,
  mapArtistListDocument,
  mapAlbumListDocument,
  mapUserResource,
} from '@/lib/music-provider/tidal/mappers';
import { createTidalTransport, type TidalProviderDependencies } from '@/lib/music-provider/tidal/transport';
import {
  DEFAULT_PROVIDER_ID,
  NATIVE_REORDER_FALLBACK_STATUSES,
  appendPlaylistTracks,
  deletePlaylistTrackItems,
  findTracksInUserCollection,
  isNativeReorderEnabled,
  logReorderDebug,
  makeSnapshotId,
  mapContainsTracksResult,
  redactId,
  throwProviderError,
  toRelationArray,
  unsupported,
} from '@/lib/music-provider/tidal/providerInternals';

export function createTidalProvider(dependencies: TidalProviderDependencies = {}): MusicProvider {
  const transport = createTidalTransport(dependencies);

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
        throwProviderError(response, await readJsonApiErrorDetails(response), 'saveTracks');
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
        throwProviderError(response, await readJsonApiErrorDetails(response), 'removeTracks');
      }
    },

    async containsTracks(payload: TrackSavePayload): Promise<boolean[]> {
      const targetIds = dedupeTrackIds(payload.ids);
      if (targetIds.length === 0) {
        return [];
      }

      const foundIds = await findTracksInUserCollection(transport, targetIds);
      return mapContainsTracksResult(payload.ids, foundIds);
    },

    async getLikedTracks(limit = 50, nextCursor?: string | null): Promise<LikedTracksPageResult<Track>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 100);
      const basePath = `/userCollectionTracks/me/relationships/items?include=items,items.artists,items.albums&page[size]=${boundedLimit}`;
      const path = nextCursor ?? basePath;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getLikedTracks');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      const page = mapTrackListDocument(raw);
      return { tracks: page.tracks, total: page.total, nextCursor: page.nextCursor };
    },

    async searchTracks(query: string, _limit = 50, offset = 0): Promise<TrackSearchResult<Track>> {
      if (offset > 0) {
        return { tracks: [], total: 0, nextOffset: null };
      }

      const path = `/searchResults/${encodeURIComponent(query)}/relationships/tracks?include=tracks,tracks.artists,tracks.albums`;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'searchTracks');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      const page = mapTrackListDocument(raw);
      return { tracks: page.tracks, total: page.tracks.length, nextOffset: null };
    },

    async searchArtists(query: string, _limit = 20, offset = 0): Promise<ArtistSearchResult> {
      if (offset > 0) {
        return { artists: [], total: 0, nextOffset: null };
      }

      const path = `/searchResults/${encodeURIComponent(query)}/relationships/artists?include=artists`;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'searchArtists');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      const result = mapArtistListDocument(raw);
      return { ...result, nextOffset: null };
    },

    async searchAlbums(query: string, _limit = 20, offset = 0): Promise<AlbumSearchResult> {
      if (offset > 0) {
        return { albums: [], total: 0, nextOffset: null };
      }

      const path = `/searchResults/${encodeURIComponent(query)}/relationships/albums?include=albums,albums.artists,albums.coverArt`;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'searchAlbums');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      const result = mapAlbumListDocument(raw);
      return { ...result, nextOffset: null };
    },

    async getArtistTopTracks(artistId: string): Promise<Track[]> {
      const path = `/artists/${encodeURIComponent(artistId)}/relationships/tracks?include=tracks,tracks.artists,tracks.albums&collapseBy=FINGERPRINT`;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getArtistTopTracks');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      return mapTrackListDocument(raw).tracks;
    },

    async getAlbumTracks(albumId: string): Promise<Track[]> {
      const path = `/albums/${encodeURIComponent(albumId)}/relationships/items?include=items,items.artists,items.albums`;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getAlbumTracks');
      }

      const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
      return mapTrackListDocument(raw).tracks;
    },

    async getCurrentUser(): Promise<CurrentUserResult> {
      const response = await transport.executeWithSession('/users/me', { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getCurrentUser');
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
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getUserProfile');
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
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getPlaylistPermissions');
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
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getPlaylistDetails');
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
        throwProviderError(response, await readJsonApiErrorDetails(response), 'createPlaylist');
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
        throwProviderError(response, await readJsonApiErrorDetails(response), 'updatePlaylistDetails');
      }
    },

    async getPlaylistTrackUris(playlistId: string): Promise<string[]> {
      const references = await transport.fetchAllPlaylistItemReferences(playlistId);
      return references.filter((reference) => reference.type === 'tracks').map((reference) => toTrackUri(reference.id));
    },

    async replacePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }> {
      const existingReferences = await transport.fetchAllPlaylistItemReferences(playlistId);
      const removable = existingReferences
        .filter(
          (reference): reference is { id: string; type: string; itemId: string } =>
            reference.type === 'tracks' && typeof reference.itemId === 'string',
        )
        .map((reference) => ({ id: reference.id, type: 'tracks' as const, meta: { itemId: reference.itemId } }));

      await deletePlaylistTrackItems(transport, playlistId, removable, 'replacePlaylistTracks');

      const trackIds = trackUris.map(fromTrackUri);
      if (trackIds.length > 0) {
        await appendPlaylistTracks(transport, playlistId, trackIds);
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
        .filter(
          (reference): reference is { id: string; type: string; itemId: string } =>
            reference.type === 'tracks' && trackIds.has(reference.id) && typeof reference.itemId === 'string',
        )
        .map((reference) => ({ id: reference.id, type: 'tracks' as const, meta: { itemId: reference.itemId } }));

      if (toRemove.length === 0) {
        return { snapshotId: makeSnapshotId() };
      }

      await deletePlaylistTrackItems(transport, playlistId, toRemove, 'removePlaylistTracks');

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

      await appendPlaylistTracks(transport, payload.playlistId, trackIds);
      return { snapshotId: makeSnapshotId() };
    },

    async reorderTracks(payload: ReorderTracksPayload): Promise<{ snapshotId: string }> {
      const rangeLength = typeof payload.rangeLength === 'number' ? Math.max(1, payload.rangeLength) : 1;
      const { fromIndex, toIndex } = payload;

      const allReferences = await transport.fetchAllPlaylistItemReferences(payload.playlistId);

      if (fromIndex < 0 || fromIndex >= allReferences.length || toIndex < 0 || toIndex > allReferences.length) {
        throw new ProviderApiError('reorderTracks failed: invalid indexes', 400, DEFAULT_PROVIDER_ID);
      }

      const movedLength = Math.min(rangeLength, allReferences.length - fromIndex);
      if (movedLength <= 0) {
        return { snapshotId: makeSnapshotId() };
      }

      const fallbackReplace = async (): Promise<{ snapshotId: string }> => {
        const reorderedTrackUris = applyReorderToTrackUris(allReferences, fromIndex, toIndex, movedLength, DEFAULT_PROVIDER_ID);
        return this.replacePlaylistTracks(payload.playlistId, reorderedTrackUris);
      };

      if (!isNativeReorderEnabled()) {
        return fallbackReplace();
      }

      const nativePlan = buildNativeReorderPayload(allReferences, fromIndex, toIndex, movedLength, DEFAULT_PROVIDER_ID);
      if (nativePlan.payload.data.length === 0) {
        return { snapshotId: makeSnapshotId() };
      }

      logReorderDebug('native patch payload', {
        playlistId: redactId(payload.playlistId),
        movedItemIds: nativePlan.movedItemIds.map(redactId),
        positionBefore: nativePlan.anchorItemId ? redactId(nativePlan.anchorItemId) : null,
      });

      const path = `/playlists/${encodeURIComponent(payload.playlistId)}/relationships/items`;
      const response = await transport.executeWithSession(
        path,
        { method: 'PATCH', body: JSON.stringify(nativePlan.payload) },
        undefined,
      );

      if (!response.ok) {
        if (NATIVE_REORDER_FALLBACK_STATUSES.has(response.status)) {
          return fallbackReplace();
        }

        throwProviderError(response, await readJsonApiErrorDetails(response), 'reorderTracks');
      }

      return { snapshotId: makeSnapshotId() };
    },

    async getUserPlaylists(limit = 50, nextCursor?: string | null): Promise<PlaylistPageResult<Playlist>> {
      const boundedLimit = Math.min(Math.max(limit, 1), 100);
      const basePath = `/userCollectionPlaylists/me/relationships/items?include=items,items.owners,items.coverArt,items.collaborators&page[size]=${boundedLimit}`;
      const path = nextCursor ?? basePath;
      const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
      if (!response.ok) {
        throwProviderError(response, await readJsonApiErrorDetails(response), 'getUserPlaylists');
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
