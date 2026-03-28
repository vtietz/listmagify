/**
 * Creates a MusicProvider instance backed by DB-stored tokens.
 *
 * Used by the background sync runner to call provider APIs without
 * a browser session. Tokens are loaded from the persistent token DB
 * and refreshed automatically via getSessionFromDb.
 */

import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { getSessionFromDb } from '@/lib/auth/sessionFromDb';

export async function createBackgroundProvider(
  userId: string,
  providerId: MusicProviderId,
): Promise<MusicProvider> {
  const getSession = async () => {
    const session = await getSessionFromDb(userId, providerId);
    if (!session) {
      throw new Error(`No valid session for ${providerId}, user=${userId}`);
    }
    return session;
  };

  if (providerId === 'spotify') {
    const { createSpotifyProvider } = await import('@/lib/music-provider/spotify/provider');
    return createSpotifyProvider({ getSession });
  }

  const { createTidalProvider } = await import('@/lib/music-provider/tidal/provider');
  return createTidalProvider({ getSession });
}
