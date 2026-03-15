import { NextRequest } from 'next/server';
import { routeErrors } from '@/lib/errors';
import { getMusicProvider, parseMusicProviderId } from '@/lib/music-provider';

const PROVIDER_HINT = 'Use ?provider=spotify|tidal or x-music-provider header.';

export function resolveMusicProviderIdFromRequest(request: NextRequest) {
  const providerValue =
    request.nextUrl.searchParams.get('provider') ??
    request.headers.get('x-music-provider') ??
    request.headers.get('x-provider');

  if (!providerValue) {
    throw routeErrors.validation(`Missing provider. ${PROVIDER_HINT}`);
  }

  try {
    return parseMusicProviderId(providerValue);
  } catch {
    throw routeErrors.validation(`Invalid provider '${providerValue}'. ${PROVIDER_HINT}`);
  }
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
    if (message.includes('Provider not implemented')) {
      throw routeErrors.featureDisabled(`Provider '${providerId}' is not available yet.`);
    }

    throw error;
  }

}
