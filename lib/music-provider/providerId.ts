import type { MusicProviderId } from './types';

export const DEFAULT_MUSIC_PROVIDER_ID: MusicProviderId = 'spotify';

const SUPPORTED_MUSIC_PROVIDER_IDS: readonly MusicProviderId[] = ['spotify', 'tidal'];

export function getSupportedMusicProviderIds(): readonly MusicProviderId[] {
  return SUPPORTED_MUSIC_PROVIDER_IDS;
}

export function isMusicProviderId(value: string | null | undefined): value is MusicProviderId {
  if (!value) {
    return false;
  }

  return SUPPORTED_MUSIC_PROVIDER_IDS.includes(value as MusicProviderId);
}

export function parseMusicProviderId(value: string | null | undefined): MusicProviderId {
  if (!value) {
    return DEFAULT_MUSIC_PROVIDER_ID;
  }

  const normalized = value.toLowerCase();
  if (!isMusicProviderId(normalized)) {
    throw new Error(`Unsupported provider: ${value}`);
  }

  return normalized;
}

export function detectMusicProviderIdFromUri(uri: string | null | undefined): MusicProviderId | null {
  if (!uri) {
    return null;
  }

  for (const providerId of SUPPORTED_MUSIC_PROVIDER_IDS) {
    if (uri.startsWith(`${providerId}:`)) {
      return providerId;
    }
  }

  return null;
}