import type { MusicProvider } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { createSpotifyProvider } from '@/lib/music-provider/spotifyProvider';
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

  if (providerId !== 'spotify') {
    throw new Error(`Provider not implemented: ${providerId}`);
  }

  const created = createSpotifyProvider();
  providers.set(providerId, created);
  return created;
}

export function resetMusicProviderForTests() {
  providers.clear();
}
