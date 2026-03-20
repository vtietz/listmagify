import type { CurrentUserResult, Image, Playlist, PlaylistTracksPageResult, SearchArtistResult, SearchAlbumResult, Track } from '@/lib/music-provider/types';
import { ProviderApiError } from '@/lib/music-provider/types';

export type JsonApiIdentifier = {
  id: string;
  type: string;
  meta?: {
    itemId?: string;
    addedAt?: string;
  };
};

export type JsonApiRelationship = {
  data?: JsonApiIdentifier | JsonApiIdentifier[] | null;
};

export type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, any>;
  relationships?: Record<string, JsonApiRelationship>;
};

export type JsonApiDocument<TData = unknown> = {
  data: TData;
  included?: JsonApiResource[];
  links?: {
    self?: string;
    next?: string | null;
  };
};

export type PlaylistItemReference = {
  id: string;
  type: string;
  itemId?: string;
  addedAt?: string;
};

export const JSON_API_CONTENT_TYPE = 'application/vnd.api+json';
export const MAX_BATCH_SIZE = 100;

export function toTrackUri(trackId: string): string {
  return `tidal:track:${trackId}`;
}

export function fromTrackUri(value: string): string {
  if (value.startsWith('tidal:track:')) {
    return value.slice('tidal:track:'.length);
  }

  return value;
}

export function dedupeTrackIds(input: string[]): string[] {
  const unique = new Set<string>();
  for (const value of input) {
    const id = fromTrackUri(value);
    if (!id) {
      continue;
    }

    unique.add(id);
  }

  return Array.from(unique);
}

export function buildJsonApiDataPayload(data: JsonApiIdentifier[]): string {
  return JSON.stringify({ data });
}

export function extractJsonApiErrorDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const asRecord = payload as Record<string, unknown>;
  const topLevelDetail = asRecord.detail;
  if (typeof topLevelDetail === 'string' && topLevelDetail.trim().length > 0) {
    return topLevelDetail.trim();
  }

  const errors = asRecord.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const detail = (entry as Record<string, unknown>).detail;
      if (typeof detail === 'string' && detail.trim().length > 0) {
        return detail.trim();
      }
    }
  }

  return null;
}

export async function readJsonApiErrorDetails(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('json')) {
    try {
      const json = await response.json();
      const detail = extractJsonApiErrorDetail(json);
      if (detail) {
        return detail;
      }

      return JSON.stringify(json);
    } catch {
      // Fall back to text body below.
    }
  }

  return response.text().catch(() => '');
}

type ReorderableReference = {
  id: string;
  type: 'tracks' | 'videos';
  itemId: string;
};

function toReorderableReference(reference: { id: string; type: string; itemId?: string }, providerId: 'tidal'): ReorderableReference {
  const normalizedType = reference.type === 'videos' ? 'videos' : 'tracks';
  if (typeof reference.itemId !== 'string' || reference.itemId.length === 0) {
    throw new ProviderApiError('reorderTracks failed: missing TIDAL itemId', 400, providerId);
  }

  return {
    id: reference.id,
    type: normalizedType,
    itemId: reference.itemId,
  };
}

export function buildNativeReorderPayload(
  allReferences: Array<{ id: string; type: string; itemId?: string }>,
  fromIndex: number,
  toIndex: number,
  rangeLength: number,
  providerId: 'tidal',
): {
  payload: {
    data: Array<{ id: string; type: 'tracks' | 'videos'; meta: { itemId: string } }>;
    meta: { positionBefore: string | null };
  };
  movedItemIds: string[];
  anchorItemId: string | null;
} {
  const moved = allReferences.slice(fromIndex, fromIndex + rangeLength).map((reference) => toReorderableReference(reference, providerId));
  if (moved.length === 0) {
    return {
      payload: {
        data: [],
        meta: { positionBefore: null },
      },
      movedItemIds: [],
      anchorItemId: null,
    };
  }

  const remaining = allReferences
    .filter((_, index) => index < fromIndex || index >= fromIndex + rangeLength)
    .map((reference) => toReorderableReference(reference, providerId));

  const effectiveTarget = toIndex > fromIndex ? toIndex - moved.length : toIndex;
  const anchorItemId = effectiveTarget < remaining.length ? remaining[effectiveTarget]!.itemId : null;

  return {
    payload: {
      data: moved.map((reference) => ({
        id: reference.id,
        type: reference.type,
        meta: { itemId: reference.itemId },
      })),
      meta: { positionBefore: anchorItemId },
    },
    movedItemIds: moved.map((reference) => reference.itemId),
    anchorItemId,
  };
}

export function applyReorderToTrackUris(
  allReferences: Array<{ id: string; type: string }>,
  fromIndex: number,
  toIndex: number,
  rangeLength: number,
  providerId: 'tidal',
): string[] {
  if (allReferences.some((reference) => reference.type !== 'tracks')) {
    throw new ProviderApiError('reorderTracks failed: fallback supports track items only', 501, providerId);
  }

  const trackUris = allReferences.map((reference) => toTrackUri(reference.id));
  const moved = trackUris.slice(fromIndex, fromIndex + rangeLength);
  if (moved.length === 0) {
    return trackUris;
  }

  const remaining = trackUris.filter((_, index) => index < fromIndex || index >= fromIndex + rangeLength);
  const effectiveTarget = toIndex > fromIndex ? toIndex - moved.length : toIndex;
  remaining.splice(effectiveTarget, 0, ...moved);
  return remaining;
}

function parseDurationToMs(duration: unknown): number {
  if (typeof duration !== 'string' || duration.length === 0) {
    return 0;
  }

  const isoMatch = duration.match(
    /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );

  if (isoMatch) {
    const hours = Number(isoMatch[1] ?? 0);
    const minutes = Number(isoMatch[2] ?? 0);
    const seconds = Number(isoMatch[3] ?? 0);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }

  const numeric = Number(duration);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return Math.round(numeric * 1000);
  }

  return 0;
}

function toIdentifierArray(relationship?: JsonApiRelationship): JsonApiIdentifier[] {
  const relationData = relationship?.data;
  if (!relationData) {
    return [];
  }

  return Array.isArray(relationData) ? relationData : [relationData];
}

export function buildIncludedIndex(included: JsonApiResource[] | undefined): Map<string, JsonApiResource> {
  const index = new Map<string, JsonApiResource>();
  if (!included) {
    return index;
  }

  for (const resource of included) {
    index.set(`${resource.type}:${resource.id}`, resource);
  }

  return index;
}

function getIncludedResource(
  index: Map<string, JsonApiResource>,
  identifier?: { id?: string; type?: string } | null,
): JsonApiResource | null {
  if (!identifier?.id || !identifier.type) {
    return null;
  }

  return index.get(`${identifier.type}:${identifier.id}`) ?? null;
}

function getFirstRelationshipResource(
  resource: JsonApiResource,
  relationshipName: string,
  index: Map<string, JsonApiResource>,
): JsonApiResource | null {
  const identifiers = toIdentifierArray(resource.relationships?.[relationshipName]);
  const first = identifiers[0];
  if (!first) {
    return null;
  }

  return getIncludedResource(index, first);
}

export function mapUserResource(raw: JsonApiResource): CurrentUserResult {
  const attributes = raw.attributes ?? {};
  const firstName = typeof attributes.firstName === 'string' ? attributes.firstName : '';
  const lastName = typeof attributes.lastName === 'string' ? attributes.lastName : '';
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    id: String(raw.id ?? ''),
    displayName: fullName || (typeof attributes.username === 'string' ? attributes.username : null),
    ...(typeof attributes.email === 'string' ? { email: attributes.email } : {}),
  };
}

type JsonApiFile = {
  href?: unknown;
  url?: unknown;
  src?: unknown;
  width?: unknown;
  height?: unknown;
  meta?: {
    width?: unknown;
    height?: unknown;
  } | null;
};

type UnknownRecord = Record<string, unknown>;

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as UnknownRecord;
}

function mapImageFromCandidate(candidate: unknown): Image | null {
  if (typeof candidate === 'string' && candidate.length > 0) {
    return { url: candidate, width: null, height: null };
  }

  const record = asRecord(candidate);
  if (!record) {
    return null;
  }

  const meta = asRecord(record.meta);
  const url = asOptionalString(record.href) ?? asOptionalString(record.url) ?? asOptionalString(record.src);
  if (!url) {
    return null;
  }

  return {
    url,
    width: asOptionalNumber(record.width) ?? asOptionalNumber(meta?.width),
    height: asOptionalNumber(record.height) ?? asOptionalNumber(meta?.height),
  };
}

function getPrimaryFile(resource: JsonApiResource | null): JsonApiFile | null {
  const files = resource?.attributes?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }

  return files[0] as JsonApiFile;
}

function mapImageFromFile(file: JsonApiFile | null): Image | null {
  return mapImageFromCandidate(file);
}

function mapImageFromResource(resource: JsonApiResource | null): Image | null {
  if (!resource) {
    return null;
  }

  const fromFiles = mapImageFromFile(getPrimaryFile(resource));
  if (fromFiles) {
    return fromFiles;
  }

  const sources = resource.attributes?.sources;
  if (Array.isArray(sources)) {
    for (const source of sources) {
      const mapped = mapImageFromCandidate(source);
      if (mapped) {
        return mapped;
      }
    }
  }

  return mapImageFromCandidate(resource.attributes);
}

function getPlaylistOwner(
  raw: JsonApiResource,
  includedIndex: Map<string, JsonApiResource>,
): { ownerId: string | null; ownerDisplayName: string | null } {
  const ownerIdentifier = toIdentifierArray(raw.relationships?.owners)[0];
  const ownerResource = getIncludedResource(includedIndex, ownerIdentifier);
  const ownerDisplayName = asOptionalString(ownerResource?.attributes?.username);

  return {
    ownerId: ownerIdentifier?.id ?? null,
    ownerDisplayName,
  };
}

function getPlaylistCoverImage(raw: JsonApiResource, includedIndex: Map<string, JsonApiResource>): Image | null {
  const coverResource =
    getFirstRelationshipResource(raw, 'coverArt', includedIndex)
    ?? getFirstRelationshipResource(raw, 'image', includedIndex)
    ?? getFirstRelationshipResource(raw, 'images', includedIndex)
    ?? getFirstRelationshipResource(raw, 'squareImage', includedIndex);

  const fromRelationship = mapImageFromResource(coverResource);
  if (fromRelationship) {
    return fromRelationship;
  }

  const attributes = raw.attributes ?? {};
  return (
    mapImageFromCandidate(attributes.coverArt)
    ?? mapImageFromCandidate(attributes.image)
    ?? mapImageFromCandidate(attributes.squareImage)
    ?? mapImageFromCandidate(attributes.coverUrl)
    ?? mapImageFromCandidate(attributes.imageUrl)
    ?? null
  );
}

function getPlaylistTracksTotal(attributes: Record<string, unknown>): number {
  return typeof attributes.numberOfItems === 'number' ? attributes.numberOfItems : 0;
}

export function mapPlaylistResource(raw: JsonApiResource, includedIndex: Map<string, JsonApiResource>): Playlist {
  const attributes = raw.attributes ?? {};
  const { ownerId, ownerDisplayName } = getPlaylistOwner(raw, includedIndex);
  const collaborators = toIdentifierArray(raw.relationships?.collaborators);

  return {
    id: String(raw.id ?? ''),
    name: String(attributes.name ?? ''),
    description: asOptionalString(attributes.description),
    ownerName: ownerDisplayName,
    owner: {
      id: ownerId,
      displayName: ownerDisplayName,
    },
    image: getPlaylistCoverImage(raw, includedIndex),
    tracksTotal: getPlaylistTracksTotal(attributes),
    isPublic: attributes.accessType === 'PUBLIC',
    collaborative: collaborators.length > 0,
  };
}

function getTrackArtists(trackResource: JsonApiResource, includedIndex: Map<string, JsonApiResource>): string[] {
  const artistIdentifiers = toIdentifierArray(trackResource.relationships?.artists);
  return artistIdentifiers
    .map((artistIdentifier) => getIncludedResource(includedIndex, artistIdentifier))
    .filter((artist): artist is JsonApiResource => artist !== null)
    .map((artist) => artist.attributes?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

function mapAlbumResource(
  albumResource: JsonApiResource | null,
  includedIndex: Map<string, JsonApiResource>,
): NonNullable<Track['album']> | null {
  if (!albumResource) {
    return null;
  }

  const albumCoverResource = getFirstRelationshipResource(albumResource, 'coverArt', includedIndex);
  return {
    id: String(albumResource.id ?? ''),
    name: asOptionalString(albumResource.attributes?.title),
    image: mapImageFromFile(getPrimaryFile(albumCoverResource)),
    releaseDate: asOptionalString(albumResource.attributes?.releaseDate),
    releaseDatePrecision: null,
  };
}

function withAddedAt(track: Track, identifier: JsonApiIdentifier): Track {
  const addedAt = asOptionalString(identifier.meta?.addedAt);
  return addedAt ? { ...track, addedAt } : track;
}

function mapTrackResource(
  identifier: JsonApiIdentifier,
  trackResource: JsonApiResource,
  includedIndex: Map<string, JsonApiResource>,
  position: number,
): Track {
  const attributes = trackResource.attributes ?? {};
  const id = String(trackResource.id ?? identifier.id ?? '');
  const albumResource = getFirstRelationshipResource(trackResource, 'albums', includedIndex);

  const mapped: Track = {
    id,
    uri: toTrackUri(id),
    name: asOptionalString(attributes.title) ?? id,
    artists: getTrackArtists(trackResource, includedIndex),
    durationMs: parseDurationToMs(attributes.duration),
    position,
    album: mapAlbumResource(albumResource, includedIndex),
    popularity: asOptionalNumber(attributes.popularity),
    explicit: attributes.explicit === true,
  };

  return withAddedAt(mapped, identifier);
}

export function mapArtistListDocument(
  rawDocument: JsonApiDocument<JsonApiIdentifier[]>,
): { artists: SearchArtistResult[]; total: number } {
  const identifiers = Array.isArray(rawDocument.data) ? rawDocument.data : [];
  const includedIndex = buildIncludedIndex(rawDocument.included);

  const artists: SearchArtistResult[] = [];

  for (const identifier of identifiers) {
    if (identifier.type !== 'artists') {
      continue;
    }

    const resource = includedIndex.get(`artists:${identifier.id}`);
    if (!resource) {
      continue;
    }

    const attributes = resource.attributes ?? {};
    const imageResource = getFirstRelationshipResource(resource, 'picture', includedIndex)
      ?? getFirstRelationshipResource(resource, 'images', includedIndex);

    artists.push({
      id: String(resource.id ?? identifier.id ?? ''),
      name: typeof attributes.name === 'string' ? attributes.name : String(resource.id ?? ''),
      image: mapImageFromResource(imageResource),
    });
  }

  return { artists, total: artists.length };
}

export function mapAlbumListDocument(
  rawDocument: JsonApiDocument<JsonApiIdentifier[]>,
): { albums: SearchAlbumResult[]; total: number } {
  const identifiers = Array.isArray(rawDocument.data) ? rawDocument.data : [];
  const includedIndex = buildIncludedIndex(rawDocument.included);

  const albums: SearchAlbumResult[] = [];

  for (const identifier of identifiers) {
    if (identifier.type !== 'albums') {
      continue;
    }

    const resource = includedIndex.get(`albums:${identifier.id}`);
    if (!resource) {
      continue;
    }

    const attributes = resource.attributes ?? {};
    const coverResource = getFirstRelationshipResource(resource, 'coverArt', includedIndex);
    const artistIdentifiers = toIdentifierArray(resource.relationships?.artists);
    const firstArtist = artistIdentifiers[0] ? includedIndex.get(`artists:${artistIdentifiers[0].id}`) : null;

    albums.push({
      id: String(resource.id ?? identifier.id ?? ''),
      name: typeof attributes.title === 'string' ? attributes.title : (typeof attributes.name === 'string' ? attributes.name : String(resource.id ?? '')),
      artistName: typeof firstArtist?.attributes?.name === 'string' ? firstArtist.attributes.name : '',
      image: mapImageFromFile(getPrimaryFile(coverResource)),
      releaseDate: typeof attributes.releaseDate === 'string' ? attributes.releaseDate : null,
    });
  }

  return { albums, total: albums.length };
}

export function mapTrackListDocument(
  rawDocument: JsonApiDocument<JsonApiIdentifier[]>,
): PlaylistTracksPageResult<Track> {
  const identifiers = Array.isArray(rawDocument.data) ? rawDocument.data : [];
  const includedIndex = buildIncludedIndex(rawDocument.included);

  let trackPosition = 0;
  const tracks: Track[] = [];

  for (const identifier of identifiers) {
    if (identifier.type !== 'tracks') {
      continue;
    }

    const trackResource = getIncludedResource(includedIndex, identifier);
    if (!trackResource) {
      continue;
    }

    tracks.push(mapTrackResource(identifier, trackResource, includedIndex, trackPosition));
    trackPosition += 1;
  }

  return {
    tracks,
    snapshotId: null,
    total: tracks.length,
    nextCursor: rawDocument.links?.next ?? null,
  };
}

export function extractPlaylistItemReferences(rawDocument: JsonApiDocument<JsonApiIdentifier[]>): PlaylistItemReference[] {
  const identifiers = Array.isArray(rawDocument.data) ? rawDocument.data : [];
  return identifiers.map((identifier) => ({
    id: String(identifier.id ?? ''),
    type: String(identifier.type ?? ''),
    ...(typeof identifier.meta?.itemId === 'string' ? { itemId: identifier.meta.itemId } : {}),
    ...(typeof identifier.meta?.addedAt === 'string' ? { addedAt: identifier.meta.addedAt } : {}),
  }));
}

export function applyReorder(trackUris: string[], fromIndex: number, toIndex: number, rangeLength = 1): string[] {
  const cloned = [...trackUris];

  const normalizedRangeLength = Math.max(1, Math.min(rangeLength, cloned.length));
  const validToIndex = toIndex >= 0 && toIndex <= cloned.length;
  const validFromIndex = fromIndex >= 0 && fromIndex < cloned.length;
  if (!validFromIndex || !validToIndex) {
    throw new Error('invalid_indexes');
  }

  const moved = cloned.splice(fromIndex, normalizedRangeLength);
  const insertAt = toIndex > fromIndex ? toIndex - normalizedRangeLength : toIndex;
  cloned.splice(insertAt, 0, ...moved);

  return cloned;
}
