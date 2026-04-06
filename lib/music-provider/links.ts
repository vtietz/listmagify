import type { MusicProviderId } from '@/lib/music-provider/types';
import { detectMusicProviderIdFromUri } from '@/lib/music-provider/providerId';

type LinkEntity = 'track' | 'artist' | 'album' | 'playlist';

const providerEntityUrlBuilders: Record<MusicProviderId, (entity: LinkEntity, id: string) => string | null> = {
  spotify: (entity, id) => `https://open.spotify.com/${entity}/${encodeURIComponent(id)}`,
  // TODO: add canonical Tidal web URLs once playlist/track URL format is finalized.
  tidal: () => null,
};

export function getProviderEntityUrl(
  entity: LinkEntity,
  id: string,
  opts?: { providerId?: MusicProviderId; uri?: string | null }
): string | null {
  const providerId = opts?.providerId ?? detectMusicProviderIdFromUri(opts?.uri) ?? null;
  if (!providerId) {
    return null;
  }

  return providerEntityUrlBuilders[providerId](entity, id);
}
