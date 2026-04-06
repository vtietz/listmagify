'use client';

import { useState } from 'react';
import { ArrowRight, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import { ImportTaskStatusIcon } from '@/features/import/ui/ImportTaskStatusIcon';
import { ImportTaskResultDialog } from '@/features/import/ui/ImportTaskResultDialog';
import { useCancelImportTask } from '@/features/import/hooks/useCancelImportTask';
import { formatRelativeTime } from '@shared/utils/formatRelativeTime';
import type { ImportJobPlaylist } from '@/lib/import/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { getProviderLikedSongsDisplayName } from '@/lib/music-provider/trackCodec';
import { isLikedSongsPlaylist } from '@/lib/sync/likedSongs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTerminalStatus(status: ImportJobPlaylist['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'partial' || status === 'cancelled';
}

function showSyncBadge(
  createSyncPair: boolean,
  status: ImportJobPlaylist['status'],
): boolean {
  return createSyncPair && isTerminalStatus(status) && status !== 'failed' && status !== 'cancelled';
}

function hasResultDetail(status: ImportJobPlaylist['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'partial';
}

function resolvePlaylistDisplayName(entry: ImportJobPlaylist, sourceProvider: MusicProviderId): string {
  const sourceName = entry.sourcePlaylistName?.trim();
  if (sourceName) {
    return sourceName;
  }

  if (isLikedSongsPlaylist(entry.sourcePlaylistId)) {
    return getProviderLikedSongsDisplayName(sourceProvider);
  }

  return 'Unnamed playlist';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImportTaskActions({ entry }: { entry: ImportJobPlaylist }) {
  const cancelTask = useCancelImportTask();
  if (entry.status !== 'queued') return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-destructive hover:text-destructive"
      title="Cancel import"
      disabled={cancelTask.isPending}
      onClick={() => cancelTask.mutate(entry.id)}
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ImportTaskRowProps {
  entry: ImportJobPlaylist;
  sourceProvider: MusicProviderId;
  targetProvider: MusicProviderId;
  jobCreatedAt: string;
  jobCompletedAt: string | null;
  createSyncPair: boolean;
}

export function ImportTaskRow({
  entry,
  sourceProvider,
  targetProvider,
  jobCreatedAt,
  jobCompletedAt,
  createSyncPair,
}: ImportTaskRowProps) {
  const [showResult, setShowResult] = useState(false);

  const timestamp = jobCompletedAt ?? jobCreatedAt;
  const clickable = hasResultDetail(entry.status);
  const playlistName = resolvePlaylistDisplayName(entry, sourceProvider);

  return (
    <div className="rounded-md border border-border">
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 px-3 py-1.5">
        {/* Provider direction */}
        <div className="flex items-center gap-1 shrink-0">
          <ProviderGlyph providerId={sourceProvider} />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <ProviderGlyph providerId={targetProvider} />
        </div>

        {/* Playlist name + sync badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm truncate" title={playlistName}>
            {playlistName}
          </span>
          {showSyncBadge(createSyncPair, entry.status) && (
            <span title="Sync pair created">
              <RefreshCw className="h-3 w-3 text-muted-foreground shrink-0" />
            </span>
          )}
        </div>

        {/* Status + time — clickable to open result dialog */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ImportTaskStatusIcon
            status={entry.status}
            onClick={clickable ? () => setShowResult(true) : undefined}
          />
          <span
            className="text-[10px] text-muted-foreground whitespace-nowrap"
            title={timestamp}
          >
            {formatRelativeTime(timestamp)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <ImportTaskActions entry={entry} />
        </div>
      </div>

      <ImportTaskResultDialog
        entry={entry}
        open={showResult}
        onClose={() => setShowResult(false)}
      />
    </div>
  );
}
