/**
 * Narrow, internal DTOs used across the app — do not leak raw Spotify JSON.
 * Keep these stable even if upstream API changes.
 */

export type Image = {
  url: string;
  width?: number | null;
  height?: number | null;
};

export type Artist = {
  id: string | null;
  name: string;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string | null;
  ownerName?: string | null;
  /** Owner object with id and displayName for linking */
  owner?: {
    id?: string | null;
    displayName?: string | null;
  } | null;
  image?: Image | null;
  tracksTotal: number;
  isPublic?: boolean | null;
  /** Whether the playlist is collaborative (followers can edit) */
  collaborative?: boolean | null;
};

export type Track = {
  id: string | null; // local files can be null
  uri: string;
  name: string;
  /** Artist names (for display) */
  artists: string[];
  /** Artist objects with IDs (for linking) */
  artistObjects?: Artist[];
  durationMs: number;
  addedAt?: string; // ISO
  position?: number; // Original position in playlist (0-indexed)
  originalPosition?: number; // Stable position for sorting (set once at load)
  album?: {
    id?: string | null;
    name?: string | null;
    image?: Image | null;
    /** Release date in format YYYY, YYYY-MM, or YYYY-MM-DD */
    releaseDate?: string | null;
    /** Precision of the release date: 'year', 'month', or 'day' */
    releaseDatePrecision?: 'year' | 'month' | 'day' | null;
  } | null;
  /** Track popularity (0-100, 100 = most popular) */
  popularity?: number | null;
  /** Whether the track contains explicit content */
  explicit?: boolean;
  /** Who added this track to the playlist (for collaborative playlists) */
  addedBy?: {
    id: string;
    displayName?: string | null;
  } | null;
  // NOTE: Audio features (tempo, key, energy, etc.) are DEPRECATED for new Spotify apps
  // as of Nov 27, 2024. Only apps with extended quota mode can access them.
  // See: https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api
};

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null; // A URL to the next page, or null when none
  total?: number;
};

/**
 * Mappers from raw Spotify Web API JSON to our DTOs.
 * Accept unknown to keep call sites tolerant to SDK/raw fetch responses.
 */
export function mapPlaylist(raw: any): Playlist {
  const images = mapImageArray(raw?.images);

  return {
    id: toStringValue(raw?.id, ''),
    name: toStringValue(raw?.name, ''),
    description: raw?.description ?? null,
    ownerName: raw?.owner?.display_name ?? null,
    owner: mapOwner(raw?.owner),
    image: images?.[0] ?? null,
    tracksTotal: toNumber(raw?.tracks?.total, 0),
    isPublic: toBooleanOrNull(raw?.public),
    collaborative: toBooleanOrNull(raw?.collaborative),
  };
}

export function mapPlaylistItemToTrack(raw: any): Track {
  const t = raw?.track ?? raw;

  // Handle unavailable tracks (Spotify returns null for removed/unavailable tracks)
  if (t === null || t === undefined) {
    console.warn('[mapPlaylistItemToTrack] Encountered null/undefined track - track may be unavailable');
    return mapUnavailableTrack(raw);
  }

  const artists = mapArtistNames(t?.artists);
  const artistObjects = mapArtistObjects(t?.artists);
  const album = mapTrackAlbum(t?.album);
  const addedBy = mapAddedBy(raw?.added_by);

  return {
    id: t?.id ?? null,
    uri: toStringValue(t?.uri, ''),
    name: toStringValue(t?.name, ''),
    artists,
    artistObjects,
    durationMs: toNumber(t?.duration_ms, 0),
    addedAt: raw?.added_at ?? undefined,
    album,
    popularity: typeof t?.popularity === 'number' ? t.popularity : null,
    explicit: t?.explicit === true,
    addedBy,
  };
}

function toStringValue(value: unknown, fallback: string): string {
  return value === null || value === undefined ? fallback : String(value);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : Number(value ?? fallback);
}

function toBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function mapImageArray(rawImages: any): Image[] | undefined {
  if (!Array.isArray(rawImages)) {
    return undefined;
  }

  return rawImages.map((img: any) => ({
    url: toStringValue(img?.url, ''),
    width: typeof img?.width === 'number' ? img.width : null,
    height: typeof img?.height === 'number' ? img.height : null,
  }));
}

function mapOwner(rawOwner: any): { id?: string | null; displayName?: string | null } | null {
  if (!rawOwner) {
    return null;
  }

  return {
    id: rawOwner.id ?? null,
    displayName: rawOwner.display_name ?? null,
  };
}

function mapAddedBy(rawAddedBy: any): { id: string; displayName?: string | null } | null {
  if (!rawAddedBy?.id) {
    return null;
  }

  return {
    id: toStringValue(rawAddedBy.id, ''),
    displayName: rawAddedBy.display_name ?? null,
  };
}

function mapArtistNames(rawArtists: any): string[] {
  if (!Array.isArray(rawArtists)) {
    return [];
  }

  return rawArtists
    .map((artist: any) => toStringValue(artist?.name, ''))
    .filter(Boolean);
}

function mapArtistObjects(rawArtists: any): Artist[] {
  if (!Array.isArray(rawArtists)) {
    return [];
  }

  return rawArtists
    .map((artist: any) => ({
      id: artist?.id ?? null,
      name: toStringValue(artist?.name, ''),
    }))
    .filter((artist: Artist) => artist.name.length > 0);
}

function isValidReleaseDatePrecision(value: unknown): value is 'year' | 'month' | 'day' {
  return value === 'year' || value === 'month' || value === 'day';
}

function mapTrackAlbum(rawAlbum: any): {
  id?: string | null;
  name?: string | null;
  image?: Image | null;
  releaseDate?: string | null;
  releaseDatePrecision?: 'year' | 'month' | 'day' | null;
} | null {
  if (!rawAlbum) {
    return null;
  }

  const images = mapImageArray(rawAlbum.images);
  return {
    id: rawAlbum.id ?? null,
    name: rawAlbum.name ?? null,
    image: images?.[0] ?? null,
    releaseDate: rawAlbum.release_date ?? null,
    releaseDatePrecision: isValidReleaseDatePrecision(rawAlbum.release_date_precision)
      ? rawAlbum.release_date_precision
      : null,
  };
}

function mapUnavailableTrack(raw: any): Track {
  return {
    id: null,
    uri: '',
    name: '[Unavailable Track]',
    artists: [],
    artistObjects: [],
    durationMs: 0,
    addedAt: raw?.added_at ?? undefined,
    album: null,
    popularity: null,
    explicit: false,
    addedBy: mapAddedBy(raw?.added_by),
  };
}

/**
 * Utility to extract {items, nextCursor, total} from Spotify paging objects.
 * Works with endpoints that return either "next" URL or cursor-based pagination.
 */
export function pageFromSpotify<T>(
  raw: any,
  map: (r: any) => T
): PageResult<T> {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  return {
    items: rawItems.map(map),
    nextCursor: raw?.next ?? null,
    total: typeof raw?.total === "number" ? raw.total : undefined,
  };
}