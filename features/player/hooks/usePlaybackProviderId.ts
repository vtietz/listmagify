/**
 * Resolves which connected provider drives playback.
 *
 * Playback is independent of the provider currently selected for browsing:
 * with Spotify and TIDAL both connected and TIDAL active, the player must
 * still control Spotify. Prefers the active provider when it supports
 * playback, otherwise the first connected provider that does.
 */

import { useMemo } from 'react';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import { useMusicProviderId } from '@features/auth/hooks/useMusicProviderId';
import { supportsProviderPlaybackControl } from '@/lib/music-provider/capabilities';
import { getSupportedMusicProviderIds } from '@/lib/music-provider/providerId';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { ProviderAuthSummary } from '@/lib/providers/types';

export function resolvePlaybackProviderId(
  activeProviderId: MusicProviderId,
  authSummary: ProviderAuthSummary,
): MusicProviderId | null {
  const candidates = getSupportedMusicProviderIds().filter(supportsProviderPlaybackControl);
  const isConnected = (id: MusicProviderId) => authSummary[id].code === 'ok';

  if (candidates.includes(activeProviderId) && isConnected(activeProviderId)) {
    return activeProviderId;
  }

  const connected = candidates.find(isConnected);
  if (connected) {
    return connected;
  }

  // Nothing connected yet (e.g. auth not hydrated): keep the active provider if it can play.
  return candidates.includes(activeProviderId) ? activeProviderId : null;
}

export function usePlaybackProviderId(): MusicProviderId | null {
  const activeProviderId = useMusicProviderId();
  const authSummary = useAuthSummary();

  return useMemo(
    () => resolvePlaybackProviderId(activeProviderId, authSummary),
    [activeProviderId, authSummary],
  );
}
