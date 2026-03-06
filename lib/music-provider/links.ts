import type { MusicProviderId } from '@/lib/music-provider/types';

type LinkEntity = 'track' | 'artist' | 'album' | 'playlist';

function detectProviderFromUri(uri?: string | null): MusicProviderId | null {
  if (!uri) {
    return null;
  }

  if (uri.startsWith('spotify:')) {
    return 'spotify';
  }

  if (uri.startsWith('tidal:')) {
    return 'tidal';
  }

  return null;
}

export function getProviderEntityUrl(
  entity: LinkEntity,
  id: string,
  opts?: { providerId?: MusicProviderId; uri?: string | null }
): string | null {
  const providerId = opts?.providerId ?? detectProviderFromUri(opts?.uri) ?? null;
  if (!providerId) {
    return null;
  }

  if (providerId === 'spotify') {
    return `https://open.spotify.com/${entity}/${encodeURIComponent(id)}`;
  }

  // TODO: add canonical Tidal web URLs once playlist/track URL format is finalized.
  return null;
}
