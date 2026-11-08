import { toProviderTrackId, toProviderTrackUri } from '@/lib/music-provider/trackCodec';
import type { MusicProvider, MusicProviderId } from '@/lib/music-provider/types';
import { setManualProviderMapping } from '@/lib/resolver/canonicalResolver';
import { addTrackUrisToPlaylist } from '@/lib/sync/applySide';
import { createBackgroundProvider } from '@/lib/sync/backgroundProvider';
import { getSyncRunForPair, updateSyncRun } from '@/lib/sync/syncRunStore';
import type { SyncPair, SyncRun, SyncWarning } from '@/lib/sync/types';

export interface ResolveTrackInput {
  pair: SyncPair;
  canonicalTrackId: string;
  targetProvider: MusicProviderId;
  providerTrackId: string;
  /** The run whose warning is being resolved; its warning and counters are updated */
  runId?: string | undefined;
}

export interface ResolveTrackResult {
  providerTrackId: string;
  playlistId: string;
  /** false when the track was already in the playlist */
  added: boolean;
}

export class ResolveTrackError extends Error {}

/**
 * The playlist the pair writes to on the given provider. For bidirectional
 * pairs within one provider the target side is used.
 */
export function pairPlaylistForProvider(
  pair: SyncPair,
  provider: MusicProviderId,
): { playlistId: string; userId: string } | null {
  const userId = pair.providerUserIds[provider] ?? pair.createdBy;
  const writesTarget = pair.direction !== 'b-to-a';
  const writesSource = pair.direction !== 'a-to-b';

  if (writesTarget && pair.targetProvider === provider) {
    return { playlistId: pair.targetPlaylistId, userId };
  }
  if (writesSource && pair.sourceProvider === provider) {
    return { playlistId: pair.sourcePlaylistId, userId };
  }
  return null;
}

function isSameWarning(warning: SyncWarning, canonicalTrackId: string, provider: MusicProviderId): boolean {
  return warning.canonicalTrackId === canonicalTrackId
    && (!warning.targetProvider || warning.targetProvider === provider);
}

/** Drops the resolved track from the pair's latest run warnings. */
export function clearResolvedWarning(
  run: SyncRun | null,
  canonicalTrackId: string,
  provider: MusicProviderId,
  added: boolean,
): void {
  if (!run) return;
  const warnings = run.warnings.filter((warning) => !isSameWarning(warning, canonicalTrackId, provider));
  if (warnings.length === run.warnings.length) return;

  updateSyncRun(run.id, {
    warningsJson: warnings.length > 0 ? JSON.stringify(warnings) : null,
    tracksUnresolved: Math.max(0, run.tracksUnresolved - 1),
    ...(added ? { tracksAdded: run.tracksAdded + 1 } : {}),
  });
}

/**
 * Saves a hand-picked match for a track a sync could not resolve and adds that
 * track to the pair's playlist right away, without running the whole sync.
 * The match is stored as a manual mapping, so later syncs use it too.
 */
export async function resolveSyncTrack(
  input: ResolveTrackInput,
  providerOverride?: MusicProvider,
): Promise<ResolveTrackResult> {
  const { pair, canonicalTrackId, targetProvider } = input;
  const side = pairPlaylistForProvider(pair, targetProvider);
  if (!side) {
    throw new ResolveTrackError('The sync pair does not write to this provider');
  }

  const providerTrackId = toProviderTrackId(targetProvider, input.providerTrackId);
  setManualProviderMapping({ provider: targetProvider, providerTrackId, canonicalTrackId });

  const provider = providerOverride ?? await createBackgroundProvider(side.userId, targetProvider);
  const uri = toProviderTrackUri(targetProvider, providerTrackId);
  const result = await addTrackUrisToPlaylist([uri], provider, targetProvider, side.playlistId);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '));
  }

  const added = result.added > 0;
  // Only the run the user is looking at is updated, never "the latest" one: another
  // sync may have finished in the meantime.
  if (input.runId) {
    clearResolvedWarning(getSyncRunForPair(input.runId, pair.id), canonicalTrackId, targetProvider, added);
  }

  return { providerTrackId, playlistId: side.playlistId, added };
}
