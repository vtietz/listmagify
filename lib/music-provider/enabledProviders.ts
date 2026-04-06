import { serverEnv } from '@/lib/env';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { DEFAULT_MUSIC_PROVIDER_ID } from '@/lib/music-provider/providerId';

export function getEnabledMusicProviders(): MusicProviderId[] {
  const configured = serverEnv.MUSIC_PROVIDERS;
  if (!configured || configured.length === 0) {
    return [DEFAULT_MUSIC_PROVIDER_ID];
  }

  return configured;
}

export function isMusicProviderEnabled(providerId: MusicProviderId): boolean {
  return getEnabledMusicProviders().includes(providerId);
}

export function getFallbackMusicProviderId(): MusicProviderId {
  const enabled = getEnabledMusicProviders();
  return enabled[0] ?? DEFAULT_MUSIC_PROVIDER_ID;
}
