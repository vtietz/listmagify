import type { MusicProvider } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { createSpotifyProvider } from '@/lib/music-provider/spotify/provider';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';
import { isMusicProviderEnabled } from '@/lib/music-provider/enabledProviders';

const providers = new Map<MusicProviderId, MusicProvider>();

function isMusicProviderId(value: string): value is MusicProviderId {
  return value === 'spotify' || value === 'tidal';
}

export function parseMusicProviderId(value: string | null | undefined): MusicProviderId {
  if (!value) {
    return 'spotify';
  }

  const normalized = value.toLowerCase();
  if (!isMusicProviderId(normalized)) {
    throw new Error(`Unsupported provider: ${value}`);
  }

  return normalized;
}

export function getMusicProvider(providerId: MusicProviderId): MusicProvider {
  if (!isMusicProviderEnabled(providerId)) {
    throw new Error(`Provider disabled: ${providerId}`);
  }

  const existing = providers.get(providerId);
  if (existing) {
    return existing;
  }

  const created = providerId === 'spotify'
    ? createSpotifyProvider()
    : createTidalProvider();
  providers.set(providerId, created);
  return created;
}

export function resetMusicProviderForTests() {
  providers.clear();
}
