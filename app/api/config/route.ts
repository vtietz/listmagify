import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { serverEnv } from '@/lib/env';
import { authOptions } from '@/lib/auth/auth';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';
import { getEnabledMusicProviders } from '@/lib/music-provider/enabledProviders';
import { getSyncTaskLimit } from '@/lib/sync/taskLimits';

/**
 * GET /api/config
 * 
 * Returns public configuration values that the client needs.
 * Only expose non-sensitive configuration here.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const maxSyncTasksPerUser = getSyncTaskLimit(getAllSessionUserIds(session));

  return NextResponse.json({
    // Polling interval in seconds for auto-reloading playlists (undefined = disabled)
    playlistPollIntervalSeconds: serverEnv.PLAYLIST_POLL_INTERVAL_SECONDS ?? null,
    // Whether Spotify BYOK (Bring Your Own Key) is enabled
    byokEnabled: serverEnv.SPOTIFY_BYOK_ENABLED ?? false,
    // Whether TIDAL BYOK (Bring Your Own Key) is enabled
    tidalByokEnabled: serverEnv.TIDAL_BYOK_ENABLED ?? false,
    // Enabled music providers (controlled by MUSIC_PROVIDERS env var)
    availableProviders: getEnabledMusicProviders(),
    // Whether the background sync scheduler is enabled
    syncSchedulerEnabled: process.env.SYNC_SCHEDULER_ENABLED === 'true',
    // Scheduler polling interval in milliseconds (defaults to 60s)
    syncSchedulerTickMs: Number(process.env.SYNC_TICK_MS ?? 60_000),
    // User-configurable sync interval options for UI dropdowns
    syncIntervalOptions: serverEnv.SYNC_INTERVAL_OPTIONS,
    // Maximum number of sync pairs allowed per user (null = unlimited)
    maxSyncTasksPerUser: maxSyncTasksPerUser ?? null,
  });
}
