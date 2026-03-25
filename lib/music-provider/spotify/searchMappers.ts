import type {
  AlbumSearchResult,
  ArtistSearchResult,
  Image,
  SearchAlbumResult,
  SearchArtistResult,
  Track,
} from '@/lib/music-provider/types';
import { mapPlaylistItemToTrack } from '@/lib/spotify/types';

export function mapSearchTracks(raw: any, boundedOffset: number): { tracks: Track[]; total: number; nextOffset: number | null } {
  const rawTracks = Array.isArray(raw?.tracks?.items) ? raw.tracks.items : [];
  const tracks = rawTracks.map((item: any) => mapPlaylistItemToTrack({ track: item }));
  const total = typeof raw?.tracks?.total === 'number' ? raw.tracks.total : 0;
  const nextOffset = boundedOffset + tracks.length < total ? boundedOffset + tracks.length : null;

  return { tracks, total, nextOffset };
}

function mapImage(imagesRaw: unknown): Image | null {
  const images = Array.isArray(imagesRaw) ? imagesRaw : [];
  return images.length > 0 && typeof images[0]?.url === 'string'
    ? { url: images[0].url, width: images[0].width ?? null, height: images[0].height ?? null }
    : null;
}

export function mapSearchArtists(raw: any, boundedOffset: number): ArtistSearchResult {
  const rawArtists = Array.isArray(raw?.artists?.items) ? raw.artists.items : [];
  const artists: SearchArtistResult[] = rawArtists.map((item: any) => ({
    id: String(item?.id ?? ''),
    name: String(item?.name ?? ''),
    image: mapImage(item?.images),
  }));
  const total = typeof raw?.artists?.total === 'number' ? raw.artists.total : 0;
  const nextOffset = boundedOffset + artists.length < total ? boundedOffset + artists.length : null;

  return { artists, total, nextOffset };
}

export function mapSearchAlbums(raw: any, boundedOffset: number): AlbumSearchResult {
  const rawAlbums = Array.isArray(raw?.albums?.items) ? raw.albums.items : [];
  const albums: SearchAlbumResult[] = rawAlbums.map((item: any) => {
    const artists = Array.isArray(item?.artists) ? item.artists : [];
    const artistName = typeof artists[0]?.name === 'string' ? artists[0].name : '';
    return {
      id: String(item?.id ?? ''),
      name: String(item?.name ?? ''),
      artistName,
      image: mapImage(item?.images),
      releaseDate: typeof item?.release_date === 'string' ? item.release_date : null,
    };
  });
  const total = typeof raw?.albums?.total === 'number' ? raw.albums.total : 0;
  const nextOffset = boundedOffset + albums.length < total ? boundedOffset + albums.length : null;

  return { albums, total, nextOffset };
}

export function mapAlbumTracks(raw: any): Track[] {
  const albumInfo = {
    id: typeof raw?.id === 'string' ? raw.id : null,
    name: typeof raw?.name === 'string' ? raw.name : null,
    image: mapImage(raw?.images),
    releaseDate: typeof raw?.release_date === 'string' ? raw.release_date : null,
  };
  const rawTracks = Array.isArray(raw?.tracks?.items) ? raw.tracks.items : [];
  return rawTracks.map((item: any) => {
    const track = mapPlaylistItemToTrack({ track: item });
    return {
      ...track,
      album: albumInfo,
    };
  });
}
