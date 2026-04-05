import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getEnabledMusicProviders } from '@/lib/music-provider/enabledProviders';

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
    // Whether Spotify BYOK (Bring Your Own Key) is enabled
    byokEnabled: serverEnv.SPOTIFY_BYOK_ENABLED ?? false,
    // Enabled music providers (controlled by MUSIC_PROVIDERS env var)
    availableProviders: getEnabledMusicProviders(),
    // Whether the background sync scheduler is enabled
    syncSchedulerEnabled: process.env.SYNC_SCHEDULER_ENABLED === 'true',
    // User-configurable sync interval options for UI dropdowns
    syncIntervalOptions: serverEnv.SYNC_INTERVAL_OPTIONS,
  });
}
