'use client';

import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncPairs, useDeleteSyncPair } from '@features/sync/hooks/useSyncPairs';
import type { SyncPairWithRun } from '@features/sync/hooks/useSyncPairs';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { SyncStatusBadge } from '@features/sync/ui/SyncStatusBadge';
import { AddSyncPairForm } from '@features/sync/ui/AddSyncPairForm';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Trash2, ArrowLeftRight } from 'lucide-react';

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Shared grid: [logo playlist] [↔] [logo playlist] [status] [actions] */
const ROW_GRID = 'grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-x-2 gap-y-0';

function SyncPairRow({ pair }: { pair: SyncPairWithRun }) {
  const openPreview = useSyncDialogStore((s) => s.openPreview);
  const deletePair = useDeleteSyncPair();

  const sourceName = usePlaylistName(pair.sourceProvider, pair.sourcePlaylistId);
  const targetName = usePlaylistName(pair.targetProvider, pair.targetPlaylistId);
  const lastSyncTime = pair.latestRun?.completedAt ?? pair.latestRun?.startedAt;

  function handleRun() {
    openPreview({
      sourceProvider: pair.sourceProvider,
      sourcePlaylistId: pair.sourcePlaylistId,
      targetProvider: pair.targetProvider,
      targetPlaylistId: pair.targetPlaylistId,
      direction: pair.direction,
      syncPairId: pair.id,
    }, true);
  }

  return (
    <div className={`${ROW_GRID} rounded-md border border-border px-3 py-2`}>
      {/* Left playlist */}
      <div className="flex items-center gap-1.5 min-w-0">
        <ProviderGlyph providerId={pair.sourceProvider} />
        <span className="text-sm truncate" title={sourceName}>{sourceName}</span>
      </div>

      {/* Arrow */}
      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      {/* Right playlist */}
      <div className="flex items-center gap-1.5 min-w-0">
        <ProviderGlyph providerId={pair.targetProvider} />
        <span className="text-sm truncate" title={targetName}>{targetName}</span>
      </div>

      {/* Status + time */}
      <div className="flex items-center gap-1.5 shrink-0">
        <SyncStatusBadge status={pair.latestRun?.status} />
        {lastSyncTime ? (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap" title={lastSyncTime}>
            {formatRelativeTime(lastSyncTime)}
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Run sync" onClick={handleRun}>
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          title="Delete sync pair"
          onClick={() => deletePair.mutate(pair.id)}
          disabled={deletePair.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function SyncManagementDialog() {
  const isManagementOpen = useSyncDialogStore((s) => s.isManagementOpen);
  const closeManagement = useSyncDialogStore((s) => s.closeManagement);
  const { data: pairs, isLoading } = useSyncPairs(isManagementOpen);

  return (
    <Dialog open={isManagementOpen} onOpenChange={(open) => { if (!open) closeManagement(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sync Management</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Loading sync pairs...</p>
          )}

          {!isLoading && (!pairs || pairs.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sync pairs configured yet.
            </p>
          )}

          {pairs?.map((pair: SyncPairWithRun) => (
            <SyncPairRow key={pair.id} pair={pair} />
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <AddSyncPairForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
