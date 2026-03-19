import type { CurrentUserResult, Playlist, PlaylistTracksPageResult, Track } from '@/lib/music-provider/types';

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

export function mapPlaylistResource(raw: JsonApiResource, includedIndex: Map<string, JsonApiResource>): Playlist {
  const attributes = raw.attributes ?? {};
  const ownerIdentifiers = toIdentifierArray(raw.relationships?.owners);
  const ownerIdentifier = ownerIdentifiers[0];
  const ownerResource = getIncludedResource(includedIndex, ownerIdentifier);
  const ownerAttributes = ownerResource?.attributes ?? {};

  const coverResource = getFirstRelationshipResource(raw, 'coverArt', includedIndex);
  const coverFile = Array.isArray(coverResource?.attributes?.files)
    ? coverResource?.attributes?.files[0]
    : null;

  const coverMeta = coverFile?.meta ?? null;
  const collaborators = toIdentifierArray(raw.relationships?.collaborators);

  return {
    id: String(raw.id ?? ''),
    name: String(attributes.name ?? ''),
    description: typeof attributes.description === 'string' ? attributes.description : null,
    ownerName: typeof ownerAttributes.username === 'string' ? ownerAttributes.username : null,
    owner: {
      id: ownerIdentifier?.id ?? null,
      displayName: typeof ownerAttributes.username === 'string' ? ownerAttributes.username : null,
    },
    image: typeof coverFile?.href === 'string'
      ? {
          url: coverFile.href,
          width: typeof coverMeta?.width === 'number' ? coverMeta.width : null,
          height: typeof coverMeta?.height === 'number' ? coverMeta.height : null,
        }
      : null,
    tracksTotal: typeof attributes.numberOfItems === 'number' ? attributes.numberOfItems : 0,
    isPublic: attributes.accessType === 'PUBLIC',
    collaborative: collaborators.length > 0,
  };
}

function mapTrackResource(
  identifier: JsonApiIdentifier,
  trackResource: JsonApiResource,
  includedIndex: Map<string, JsonApiResource>,
  position: number,
): Track {
  const attributes = trackResource.attributes ?? {};
  const artistIdentifiers = toIdentifierArray(trackResource.relationships?.artists);
  const artists = artistIdentifiers
    .map((artistIdentifier) => getIncludedResource(includedIndex, artistIdentifier))
    .filter((artist): artist is JsonApiResource => artist !== null)
    .map((artist) => artist.attributes?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);

  const albumResource = getFirstRelationshipResource(trackResource, 'albums', includedIndex);
  const albumCoverResource = albumResource
    ? getFirstRelationshipResource(albumResource, 'coverArt', includedIndex)
    : null;
  const albumCoverFile = Array.isArray(albumCoverResource?.attributes?.files)
    ? albumCoverResource?.attributes?.files[0]
    : null;

  const id = String(trackResource.id ?? identifier.id ?? '');

  const mapped: Track = {
    id,
    uri: toTrackUri(id),
    name: typeof attributes.title === 'string' ? attributes.title : id,
    artists,
    durationMs: parseDurationToMs(attributes.duration),
    position,
    album: albumResource
      ? {
          id: String(albumResource.id ?? ''),
          name: typeof albumResource.attributes?.title === 'string' ? albumResource.attributes.title : null,
          image: typeof albumCoverFile?.href === 'string'
            ? {
                url: albumCoverFile.href,
                width: typeof albumCoverFile?.meta?.width === 'number' ? albumCoverFile.meta.width : null,
                height: typeof albumCoverFile?.meta?.height === 'number' ? albumCoverFile.meta.height : null,
              }
            : null,
          releaseDate: typeof albumResource.attributes?.releaseDate === 'string'
            ? albumResource.attributes.releaseDate
            : null,
          releaseDatePrecision: null,
        }
      : null,
    popularity: typeof attributes.popularity === 'number' ? attributes.popularity : null,
    explicit: attributes.explicit === true,
  };

  if (typeof identifier.meta?.addedAt === 'string') {
    mapped.addedAt = identifier.meta.addedAt;
  }

  return mapped;
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
