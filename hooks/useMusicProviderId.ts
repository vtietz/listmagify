import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthSummary } from '@/hooks/auth/useAuth';
import type { MusicProviderId } from '@/lib/music-provider/types';

const STORAGE_KEY = 'music-provider-id';

function isMusicProviderId(value: string | null | undefined): value is MusicProviderId {
  return value === 'spotify' || value === 'tidal';
}

export function resolveClientMusicProviderId(searchValue?: string | null): MusicProviderId {
  if (isMusicProviderId(searchValue)) {
    return searchValue;
  }

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isMusicProviderId(stored)) {
      return stored;
    }
  }

  return 'spotify';
}

function getConnectedProviders(summary: ReturnType<typeof useAuthSummary>): MusicProviderId[] {
  const connected: MusicProviderId[] = [];

  if (summary.spotify.code === 'ok') {
    connected.push('spotify');
  }

  if (summary.tidal.code === 'ok') {
    connected.push('tidal');
  }

  return connected;
}

export function useMusicProviderId(): MusicProviderId {
  const searchParams = useSearchParams();
  const authSummary = useAuthSummary();
  const provider = searchParams?.get('provider') ?? null;

  return useMemo(() => {
    const fallbackResolved = resolveClientMusicProviderId(provider);
    const connectedProviders = getConnectedProviders(authSummary);

    const resolved = connectedProviders.length === 0
      ? fallbackResolved
      : connectedProviders.includes(fallbackResolved)
        ? fallbackResolved
        : connectedProviders[0]!;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, resolved);
    }

    return resolved;
  }, [provider, authSummary]);
}
