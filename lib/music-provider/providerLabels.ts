import type { MusicProviderId } from './types';

const PROVIDER_DISPLAY_NAMES: Record<MusicProviderId, string> = {
  spotify: 'Spotify',
  tidal: 'TIDAL',
};

/** Human-readable display name for a single provider. */
export function getProviderDisplayName(id: MusicProviderId): string {
  return PROVIDER_DISPLAY_NAMES[id];
}

/**
 * Joins provider display names in natural language.
 *   ['spotify']          → "Spotify"
 *   ['spotify', 'tidal'] → "Spotify and TIDAL"
 *   3+ providers         → "Spotify, TIDAL, and Foo"
 */
export function formatProviderNames(providers: MusicProviderId[]): string {
  const names = providers.map(getProviderDisplayName);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}
