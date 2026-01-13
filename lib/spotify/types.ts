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
  const images: Image[] | undefined = Array.isArray(raw?.images)
    ? raw.images.map((img: any) => ({
        url: String(img?.url ?? ""),
        width: typeof img?.width === "number" ? img.width : undefined,
        height: typeof img?.height === "number" ? img.height : undefined,
      }))
    : undefined;

  return {
    id: String(raw?.id ?? ""),
    name: String(raw?.name ?? ""),
    description: raw?.description ?? null,
    ownerName: raw?.owner?.display_name ?? null,
    owner: raw?.owner ? {
      id: raw.owner.id ?? null,
      displayName: raw.owner.display_name ?? null,
    } : null,
    image: images?.[0] ?? null,
    tracksTotal: Number(raw?.tracks?.total ?? 0),
    isPublic: typeof raw?.public === "boolean" ? raw.public : null,
    collaborative: typeof raw?.collaborative === "boolean" ? raw.collaborative : null,
  };
}

export function mapPlaylistItemToTrack(raw: any): Track {
  const t = raw?.track ?? raw;

  // Handle unavailable tracks (Spotify returns null for removed/unavailable tracks)
  if (t === null || t === undefined) {
    console.warn('[mapPlaylistItemToTrack] Encountered null/undefined track - track may be unavailable');
    return {
      id: null,
      uri: '', // Empty URI will be filtered out when saving playlist order
      name: '[Unavailable Track]',
      artists: [],
      artistObjects: [],
      durationMs: 0,
      addedAt: raw?.added_at ?? undefined,
      album: null,
      popularity: null,
      explicit: false,
      addedBy: raw?.added_by?.id
        ? {
            id: String(raw.added_by.id),
            displayName: raw.added_by.display_name ?? null,
          }
        : null,
    };
  }

  const albumImages: Image[] | undefined = Array.isArray(t?.album?.images)
    ? t.album.images.map((img: any) => ({
        url: String(img?.url ?? ""),
        width: typeof img?.width === "number" ? img.width : undefined,
        height: typeof img?.height === "number" ? img.height : undefined,
      }))
    : undefined;

  const artists: string[] = Array.isArray(t?.artists)
    ? t.artists.map((a: any) => String(a?.name ?? "")).filter(Boolean)
    : [];

  const artistObjects = Array.isArray(t?.artists)
    ? t.artists.map((a: any) => ({
        id: a?.id ?? null,
        name: String(a?.name ?? ""),
      })).filter((a: { name: string }) => a.name)
    : [];

  return {
    id: t?.id ?? null,
    uri: String(t?.uri ?? ""),
    name: String(t?.name ?? ""),
    artists,
    artistObjects,
    durationMs: Number(t?.duration_ms ?? 0),
    addedAt: raw?.added_at ?? undefined,
    album: t?.album
      ? {
          id: t?.album?.id ?? null,
          name: t?.album?.name ?? null,
          image: albumImages?.[0] ?? null,
          releaseDate: t?.album?.release_date ?? null,
          releaseDatePrecision: ['year', 'month', 'day'].includes(t?.album?.release_date_precision)
            ? t?.album?.release_date_precision as 'year' | 'month' | 'day'
            : null,
        }
      : null,
    popularity: typeof t?.popularity === 'number' ? t.popularity : null,
    explicit: t?.explicit === true,
    addedBy: raw?.added_by?.id
      ? {
          id: String(raw.added_by.id),
          displayName: raw.added_by.display_name ?? null,
        }
      : null,
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