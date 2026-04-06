import type { MusicProvider } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { createSpotifyProvider } from '@/lib/music-provider/spotify/provider';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';
import { isMusicProviderEnabled } from '@/lib/music-provider/enabledProviders';
import {
  isMusicProviderId,
  parseMusicProviderId,
  getSupportedMusicProviderIds,
  DEFAULT_MUSIC_PROVIDER_ID,
  detectMusicProviderIdFromUri,
} from '@/lib/music-provider/providerId';

const providers = new Map<MusicProviderId, MusicProvider>();

const providerFactories: Record<MusicProviderId, () => MusicProvider> = {
  spotify: createSpotifyProvider,
  tidal: createTidalProvider,
};

export {
  isMusicProviderId,
  parseMusicProviderId,
  getSupportedMusicProviderIds,
  DEFAULT_MUSIC_PROVIDER_ID,
  detectMusicProviderIdFromUri,
};

export function getMusicProvider(providerId: MusicProviderId): MusicProvider {
  if (!isMusicProviderEnabled(providerId)) {
    throw new Error(`Provider disabled: ${providerId}`);
  }

  const existing = providers.get(providerId);
  if (existing) {
    return existing;
  }

  const created = providerFactories[providerId]();
  providers.set(providerId, created);
  return created;
}

export function resetMusicProviderForTests() {
  providers.clear();
}
