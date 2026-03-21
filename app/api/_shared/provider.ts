import { NextRequest } from 'next/server';
import { routeErrors } from '@/lib/errors';
import { getMusicProvider, parseMusicProviderId } from '@/lib/music-provider';
import type { MusicProviderId } from '@/lib/music-provider/types';
import {
  getFallbackMusicProviderId,
  isMusicProviderEnabled,
} from '@/lib/music-provider/enabledProviders';
import { isPlaylistIdCompatibleWithProvider } from '@/lib/providers/playlistIdCompat';

const PROVIDER_HINT = 'Use ?provider=spotify|tidal or x-music-provider header.';
const FALLBACK_PROVIDER_ID = getFallbackMusicProviderId();

export function resolveMusicProviderIdFromRequest(request: NextRequest) {
  const providerValue =
    request.nextUrl.searchParams.get('provider') ??
    request.headers.get('x-music-provider') ??
    request.headers.get('x-provider');

  if (!providerValue) {
    console.warn(
      `[provider] Missing provider for ${request.nextUrl.pathname}; defaulting to '${FALLBACK_PROVIDER_ID}'.`,
    );
    return FALLBACK_PROVIDER_ID;
  }

  try {
    const providerId = parseMusicProviderId(providerValue);
    if (!isMusicProviderEnabled(providerId)) {
      throw routeErrors.featureDisabled(`Provider '${providerId}' is disabled by server configuration.`);
    }

    return providerId;
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }

    throw routeErrors.validation(`Invalid provider '${providerValue}'. ${PROVIDER_HINT}`);
  }
}

export function getMusicProviderHintFromRequest(request: NextRequest) {
  const providerValue =
    request.nextUrl.searchParams.get('provider')
    ?? request.headers.get('x-music-provider')
    ?? request.headers.get('x-provider');

  return providerValue === 'tidal' ? 'tidal' : 'spotify';
}

export function resolveMusicProviderFromRequest(request: NextRequest) {
  const providerId = resolveMusicProviderIdFromRequest(request);

  try {
    return {
      providerId,
      provider: getMusicProvider(providerId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Provider disabled')) {
      throw routeErrors.featureDisabled(`Provider '${providerId}' is disabled by server configuration.`);
    }

    if (message.includes('Provider not implemented')) {
      throw routeErrors.featureDisabled(`Provider '${providerId}' is not available yet.`);
    }

    throw error;
  }
}

/**
 * Validates that a playlist ID format is compatible with the resolved provider.
 * Throws a 400 if a Spotify ID is sent to TIDAL or vice versa.
 */
export function assertPlaylistProviderCompat(playlistId: string, providerId: MusicProviderId): void {
  if (!isPlaylistIdCompatibleWithProvider(playlistId, providerId)) {
    throw routeErrors.validation(
      `Playlist ID '${playlistId}' is not compatible with provider '${providerId}'`
    );
  }
}
