import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
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

export function useMusicProviderId(): MusicProviderId {
  const searchParams = useSearchParams();
  const provider = searchParams?.get('provider') ?? null;

  return useMemo(() => {
    const resolved = resolveClientMusicProviderId(provider);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, resolved);
    }

    return resolved;
  }, [provider]);
}
