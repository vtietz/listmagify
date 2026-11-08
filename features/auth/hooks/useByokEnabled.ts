'use client';

import { useEffect, useState } from 'react';
import type { MusicProviderId } from '@/lib/music-provider/types';

type ByokConfig = { byokEnabled?: boolean; tidalByokEnabled?: boolean };

/** `/api/config` exposes one BYOK flag per provider. */
const BYOK_CONFIG_KEYS: Record<MusicProviderId, keyof ByokConfig> = {
  spotify: 'byokEnabled',
  tidal: 'tidalByokEnabled',
};

/**
 * Whether the server allows BYOK (Bring Your Own Key) for a provider.
 * Returns null while loading. Pass `enabled: false` to skip the request.
 */
export function useByokEnabled(providerId: MusicProviderId, enabled = true): boolean | null {
  const [byokEnabled, setByokEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    fetch('/api/config')
      .then((res) => res.json())
      .then((data: ByokConfig) => {
        if (!cancelled) {
          setByokEnabled(data[BYOK_CONFIG_KEYS[providerId]] ?? false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setByokEnabled(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerId, enabled]);

  return byokEnabled;
}
