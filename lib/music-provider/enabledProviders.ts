import { serverEnv } from '@/lib/env';
import type { MusicProviderId } from '@/lib/music-provider/types';

const DEFAULT_PROVIDER: MusicProviderId = 'spotify';

export function getEnabledMusicProviders(): MusicProviderId[] {
  const configured = serverEnv.MUSIC_PROVIDERS;
  if (!configured || configured.length === 0) {
    return [DEFAULT_PROVIDER];
  }

  return configured;
}

export function isMusicProviderEnabled(providerId: MusicProviderId): boolean {
  return getEnabledMusicProviders().includes(providerId);
}

export function getFallbackMusicProviderId(): MusicProviderId {
  const enabled = getEnabledMusicProviders();
  return enabled[0] ?? DEFAULT_PROVIDER;
}
