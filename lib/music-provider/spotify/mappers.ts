import {
  ProviderApiError,
  type CurrentUserResult,
  type PlaylistTracksPageResult,
  type PublicUserProfileResult,
  type Track,
} from '@/lib/music-provider/types';
import { mapPlaylistItemToTrack } from '@/lib/spotify/types';
import { DEFAULT_PROVIDER_ID } from './http';

export function buildTracksPath(playlistId: string, limit: number, nextCursor?: string | null): string {
  const fields = 'items(track(id,uri,name,artists(name),duration_ms,album(id,name,images,release_date,release_date_precision),popularity),added_at,added_by(id,display_name)),next,total,snapshot_id';
  if (!nextCursor) {
    return `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&fields=${encodeURIComponent(fields)}`;
  }

  try {
    const url = new URL(nextCursor);
    const offset = url.searchParams.get('offset') || '0';
    const parsedLimit = url.searchParams.get('limit') || String(limit);
    return `/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${parsedLimit}&fields=${encodeURIComponent(fields)}`;
  } catch {
    return nextCursor.includes('fields=') ? nextCursor : `${nextCursor}&fields=${encodeURIComponent(fields)}`;
  }
}

export function mapCurrentUser(raw: any): CurrentUserResult {
  return {
    id: String(raw?.id ?? ''),
    displayName: typeof raw?.display_name === 'string' ? raw.display_name : null,
    ...(typeof raw?.email === 'string' ? { email: raw.email } : {}),
  };
}

export function mapPublicUser(raw: any, fallbackId: string): PublicUserProfileResult {
  return {
    id: typeof raw?.id === 'string' && raw.id.length > 0 ? raw.id : fallbackId,
    displayName: typeof raw?.display_name === 'string' ? raw.display_name : null,
    imageUrl: typeof raw?.images?.[0]?.url === 'string' ? raw.images[0].url : null,
    ...(typeof raw?.email === 'string' ? { email: raw.email } : {}),
  };
}

export async function requireSnapshotId(response: Response, operation: string): Promise<{ snapshotId: string }> {
  const result = await response.json();
  const snapshotId = result?.snapshot_id;
  if (!snapshotId || typeof snapshotId !== 'string') {
    throw new ProviderApiError(`${operation} failed: missing snapshot_id`, 500, DEFAULT_PROVIDER_ID);
  }

  return { snapshotId };
}

function extractOffsetFromCursor(nextCursor?: string | null): number {
  if (!nextCursor) {
    return 0;
  }

  try {
    const url = new URL(nextCursor);
    return parseInt(url.searchParams.get('offset') || '0', 10);
  } catch {
    return 0;
  }
}

export function mapPlaylistTracksPage(raw: any, nextCursor?: string | null): PlaylistTracksPageResult<Track> {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const baseOffset = extractOffsetFromCursor(nextCursor);
  return {
    tracks: rawItems.map((item: any, index: number) => ({
      ...mapPlaylistItemToTrack(item),
      position: baseOffset + index,
    })),
    snapshotId: raw?.snapshot_id ?? null,
    total: typeof raw?.total === 'number' ? raw.total : rawItems.length,
    nextCursor: raw?.next ?? null,
  };
}
