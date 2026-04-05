import type { Artist, CurrentUserResult, Image, Playlist, PlaylistTracksPageResult, SearchArtistResult, SearchAlbumResult, Track } from '@/lib/music-provider/types';
import type {
  JsonApiDocument,
  JsonApiIdentifier,
  JsonApiResource,
  PlaylistItemReference,
} from './jsonApi';
import {
  buildIncludedIndex,
  getFirstRelationshipResource,
  getIncludedResource,
  toTrackUri,
} from './jsonApi';

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

function clampToTrackPopularityRange(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}

function normalizeTidalPopularity(value: unknown): number | null {
  const numeric = asOptionalNumber(value);
  if (numeric == null || Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return null;
  }

  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return Math.round(clampToTrackPopularityRange(normalized));
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

const TIDAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildTidalImageUrl(uuid: string, size = 640): string {
  return `https://resources.tidal.com/images/${uuid.replace(/-/g, '/')}/${size}x${size}.jpg`;
}

function getCoverArtFromRelationshipId(raw: JsonApiResource): Image | null {
  const coverArtData = raw.relationships?.coverArt?.data;
  const identifier = Array.isArray(coverArtData) ? coverArtData[0] : coverArtData;
  if (!identifier || typeof identifier !== 'object' || !('id' in identifier)) {
    return null;
  }

  const id = (identifier as { id: string }).id;
  if (!TIDAL_UUID_PATTERN.test(id)) {
    return null;
  }

  return { url: buildTidalImageUrl(id), width: 640, height: 640 };
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
    ?? getCoverArtFromRelationshipId(raw)
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

function toIdentifierArray(relationship?: { data?: JsonApiIdentifier | JsonApiIdentifier[] | null }): JsonApiIdentifier[] {
  const relationData = relationship?.data;
  if (!relationData) {
    return [];
  }

  return Array.isArray(relationData) ? relationData : [relationData];
}

function getTrackArtists(trackResource: JsonApiResource, includedIndex: Map<string, JsonApiResource>): string[] {
  const artistIdentifiers = toIdentifierArray(trackResource.relationships?.artists);
  return artistIdentifiers
    .map((artistIdentifier) => getIncludedResource(includedIndex, artistIdentifier))
    .filter((artist): artist is JsonApiResource => artist !== null)
    .map((artist) => artist.attributes?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

function getTrackArtistObjects(trackResource: JsonApiResource, includedIndex: Map<string, JsonApiResource>): Artist[] {
  const artistIdentifiers = toIdentifierArray(trackResource.relationships?.artists);
  const artists: Artist[] = [];

  for (const artistIdentifier of artistIdentifiers) {
    const resource = getIncludedResource(includedIndex, artistIdentifier);
    if (!resource) {
      continue;
    }

    const name = resource.attributes?.name;
    if (typeof name !== 'string' || name.length === 0) {
      continue;
    }

    artists.push({ id: artistIdentifier.id, name });
  }

  return artists;
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
    artistObjects: getTrackArtistObjects(trackResource, includedIndex),
    durationMs: parseDurationToMs(attributes.duration),
    position,
    album: mapAlbumResource(albumResource, includedIndex),
    popularity: normalizeTidalPopularity(attributes.popularity),
    explicit: attributes.explicit === true,
    isrc: typeof attributes.isrc === 'string' ? attributes.isrc : null,
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

function resolveAlbumName(attributes: Record<string, unknown>, fallbackId: string): string {
  if (typeof attributes.title === 'string') {
    return attributes.title;
  }

  if (typeof attributes.name === 'string') {
    return attributes.name;
  }

  return fallbackId;
}

function resolveFirstArtistName(
  resource: JsonApiResource,
  includedIndex: Map<string, JsonApiResource>,
): string {
  const artistIdentifiers = toIdentifierArray(resource.relationships?.artists);
  const firstArtistIdentifier = artistIdentifiers[0];
  if (!firstArtistIdentifier) {
    return '';
  }

  const firstArtist = includedIndex.get(`artists:${firstArtistIdentifier.id}`);
  const artistName = firstArtist?.attributes?.name;

  return typeof artistName === 'string' ? artistName : '';
}

function mapAlbumSearchResult(
  identifier: JsonApiIdentifier,
  resource: JsonApiResource,
  includedIndex: Map<string, JsonApiResource>,
): SearchAlbumResult {
  const attributes = resource.attributes ?? {};
  const coverResource = getFirstRelationshipResource(resource, 'coverArt', includedIndex);

  return {
    id: String(resource.id ?? identifier.id ?? ''),
    name: resolveAlbumName(attributes, String(resource.id ?? '')),
    artistName: resolveFirstArtistName(resource, includedIndex),
    image: mapImageFromFile(getPrimaryFile(coverResource)),
    releaseDate: typeof attributes.releaseDate === 'string' ? attributes.releaseDate : null,
  };
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

    albums.push(mapAlbumSearchResult(identifier, resource, includedIndex));
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
