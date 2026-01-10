import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';

/**
 * GET /api/config
 * 
 * Returns public configuration values that the client needs.
 * Only expose non-sensitive configuration here.
 */
export async function GET() {
  return NextResponse.json({
    // Polling interval in seconds for auto-reloading playlists (undefined = disabled)
    playlistPollIntervalSeconds: serverEnv.PLAYLIST_POLL_INTERVAL_SECONDS ?? null,
    // Whether BYOK (Bring Your Own Key) is enabled
    byokEnabled: serverEnv.BYOK_ENABLED ?? false,
  });
}
