/**
 * Narrow, internal DTOs used across the app — do not leak raw Spotify JSON.
 * Keep these stable even if upstream API changes.
 */

export type Image = {
  url: string;
  width?: number | null;
  height?: number | null;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string | null;
  ownerName?: string | null;
  image?: Image | null;
  tracksTotal: number;
  isPublic?: boolean | null;
};

export type Track = {
  id: string | null; // local files can be null
  uri: string;
  name: string;
  artists: string[];
  durationMs: number;
  addedAt?: string; // ISO
  position?: number; // Original position in playlist (0-indexed)
  originalPosition?: number; // Stable position for sorting (set once at load)
  album?: {
    id?: string | null;
    name?: string | null;
    image?: Image | null;
  } | null;
  // Audio features from Spotify Audio Features API
  tempoBpm?: number; // Spotify: tempo (e.g., 120.5)
  musicalKey?: number; // Spotify: key (0-11, C=0, C#=1, etc.)
  mode?: number; // Spotify: mode (0=minor, 1=major)
  acousticness?: number; // 0.0 - 1.0
  energy?: number; // 0.0 - 1.0
  instrumentalness?: number; // 0.0 - 1.0
  liveness?: number; // 0.0 - 1.0
  valence?: number; // 0.0 - 1.0 (musical positivity)
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
    image: images?.[0] ?? null,
    tracksTotal: Number(raw?.tracks?.total ?? 0),
    isPublic: typeof raw?.public === "boolean" ? raw.public : null,
  };
}

export function mapPlaylistItemToTrack(raw: any): Track {
  const t = raw?.track ?? raw;

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

  return {
    id: t?.id ?? null,
    uri: String(t?.uri ?? ""),
    name: String(t?.name ?? ""),
    artists,
    durationMs: Number(t?.duration_ms ?? 0),
    addedAt: raw?.added_at ?? undefined,
    album: t?.album
      ? {
          id: t?.album?.id ?? null,
          name: t?.album?.name ?? null,
          image: albumImages?.[0] ?? null,
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