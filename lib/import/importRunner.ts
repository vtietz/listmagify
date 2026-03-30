import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import type { ImportJobPlaylist } from './types';
import {
  getImportJobWithPlaylists,
  updateImportJob,
  updateImportJobPlaylist,
} from './importStore';
import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';
import { fetchFullPlaylistTracks, canonicalizeSnapshot } from '@/lib/sync/snapshot';
import { createSyncMaterializeAdapter } from '@/lib/sync/materializeAdapter';
import { materializeCanonicalTrackIds } from '@/lib/recs/materialize';
import { findUserIdForProvider } from '@/lib/auth/tokenStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTrackUri(providerId: MusicProviderId, trackId: string): string {
  if (trackId.includes(':')) return trackId; // already a URI
  return providerId === 'spotify' ? `spotify:track:${trackId}` : trackId;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Import a single playlist
// ---------------------------------------------------------------------------

async function importPlaylist(
  playlist: ImportJobPlaylist,
  sourceProvider: MusicProvider,
  sourceProviderId: MusicProviderId,
  targetProvider: MusicProvider,
  targetProviderId: MusicProviderId,
  targetProviderUserId: string,
): Promise<void> {
  // Step 1: Create playlist on target provider
  updateImportJobPlaylist(playlist.id, { status: 'creating' });

  const createdPlaylist = await targetProvider.createPlaylist({
    userId: targetProviderUserId,
    name: playlist.sourcePlaylistName,
    description: `Imported from ${sourceProviderId}`,
    isPublic: false,
  });

  updateImportJobPlaylist(playlist.id, {
    targetPlaylistId: createdPlaylist.id,
  });

  // Step 2: Fetch all source tracks
  updateImportJobPlaylist(playlist.id, { status: 'resolving_tracks' });

  const { tracks, snapshotId } = await fetchFullPlaylistTracks(
    sourceProvider,
    playlist.sourcePlaylistId,
  );

  updateImportJobPlaylist(playlist.id, { trackCount: tracks.length });

  if (tracks.length === 0) {
    updateImportJobPlaylist(playlist.id, { status: 'done' });
    return;
  }

  // Step 3: Canonicalize tracks
  const snapshot = canonicalizeSnapshot(
    sourceProviderId,
    playlist.sourcePlaylistId,
    tracks,
    snapshotId,
  );

  const canonicalTrackIds = snapshot.items.map((item) => item.canonicalTrackId);

  // Step 4: Resolve tracks to target provider
  const adapter = createSyncMaterializeAdapter(targetProvider, targetProviderId);
  const materializeResult = await materializeCanonicalTrackIds({
    provider: targetProviderId,
    canonicalTrackIds,
    adapter,
  });

  const resolvedCount = materializeResult.trackIds.length;
  const unresolvedCount = materializeResult.unresolvedCanonicalIds.length;

  updateImportJobPlaylist(playlist.id, {
    status: 'adding_tracks',
    tracksResolved: resolvedCount,
    tracksUnresolved: unresolvedCount,
  });

  // Step 5: Add tracks in batches
  const trackUris = materializeResult.trackIds.map((id) => toTrackUri(targetProviderId, id));
  let tracksAdded = 0;

  for (const batch of chunk(trackUris, BATCH_SIZE)) {
    await targetProvider.addTracks({
      playlistId: createdPlaylist.id,
      trackUris: batch,
    });
    tracksAdded += batch.length;
  }

  // Step 6: Update final status
  const hasUnresolved = unresolvedCount > 0;
  const finalStatus = hasUnresolved ? 'partial' : 'done';

  let errMsg: string | null = null;
  if (hasUnresolved) {
    errMsg = `${unresolvedCount} track${unresolvedCount === 1 ? '' : 's'} could not be found on ${targetProviderId}`;
  }

  updateImportJobPlaylist(playlist.id, {
    status: finalStatus,
    tracksAdded,
    errorMessage: errMsg,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Executes an import job: creates playlists on the target provider,
 * resolves tracks cross-provider, and adds them in batches.
 *
 * Each playlist is processed independently so one failure does not
 * stop the rest.
 */
export async function executeImportJob(jobId: string): Promise<void> {
  const job = getImportJobWithPlaylists(jobId);
  if (!job) {
    console.error('[import/runner] job not found', { jobId });
    return;
  }

  // Mark job as running
  updateImportJob(jobId, { status: 'running' });

  const sourceProviderId = job.sourceProvider as MusicProviderId;
  const targetProviderId = job.targetProvider as MusicProviderId;

  // Each provider may store tokens under a different user_id
  // (e.g. Spotify username vs TIDAL numeric ID), so we resolve
  // the correct user_id per provider from the token DB.
  const sourceUserId = findUserIdForProvider(sourceProviderId) ?? job.createdBy;
  const targetUserId = findUserIdForProvider(targetProviderId) ?? job.createdBy;

  let sourceProvider: MusicProvider;
  let targetProvider: MusicProvider;

  try {
    [sourceProvider, targetProvider] = await Promise.all([
      createBackgroundProvider(sourceUserId, sourceProviderId),
      createBackgroundProvider(targetUserId, targetProviderId),
    ]);
  } catch (err) {
    console.error('[import/runner] failed to create providers', {
      jobId,
      error: errorMessage(err),
    });
    updateImportJob(jobId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
    });
    return;
  }

  // Get target user info for playlist creation
  let targetProviderUserId: string;
  try {
    const user = await targetProvider.getCurrentUser();
    targetProviderUserId = user.id;
  } catch (err) {
    console.error('[import/runner] failed to get target user', {
      jobId,
      error: errorMessage(err),
    });
    updateImportJob(jobId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
    });
    return;
  }

  let allFailed = true;

  for (const playlist of job.playlists) {
    try {
      await importPlaylist(
        playlist,
        sourceProvider,
        sourceProviderId,
        targetProvider,
        targetProviderId,
        targetProviderUserId,
      );
      allFailed = false;
    } catch (err) {
      console.error('[import/runner] playlist import failed', {
        jobId,
        playlistId: playlist.sourcePlaylistId,
        playlistName: playlist.sourcePlaylistName,
        error: errorMessage(err),
      });
      updateImportJobPlaylist(playlist.id, {
        status: 'failed',
        errorMessage: errorMessage(err),
      });
    }
  }

  // If at least one playlist did not completely fail, mark as done
  // (individual playlists may be 'partial' or 'failed')
  const finalStatus = allFailed && job.playlists.length > 0 ? 'failed' : 'done';

  updateImportJob(jobId, {
    status: finalStatus,
    completedAt: new Date().toISOString(),
  });

  console.debug('[import/runner] job completed', {
    jobId,
    status: finalStatus,
    totalPlaylists: job.playlists.length,
  });
}
