'use client';

import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncPairs, useDeleteSyncPair } from '@features/sync/hooks/useSyncPairs';
import type { SyncPairWithRun } from '@features/sync/hooks/useSyncPairs';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { useSyncExecute } from '@features/sync/hooks/useSyncExecute';
import { SyncStatusBadge } from '@features/sync/ui/SyncStatusBadge';
import { AddSyncPairForm } from '@features/sync/ui/AddSyncPairForm';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Eye, Trash2, ArrowLeftRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicProviderId } from '@/lib/music-provider/types';

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

const ROW_GRID = 'grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-x-2';

function SyncPairRow({ pair, bothConnected }: { pair: SyncPairWithRun; bothConnected: boolean }) {
  const openPreview = useSyncDialogStore((s) => s.openPreview);
  const deletePair = useDeleteSyncPair();
  const execute = useSyncExecute();

  const sourceName = usePlaylistName(pair.sourceProvider, pair.sourcePlaylistId);
  const targetName = usePlaylistName(pair.targetProvider, pair.targetPlaylistId);
  const lastSyncTime = pair.latestRun?.completedAt ?? pair.latestRun?.startedAt;
  const isSyncing = execute.isPending;

  const pairConfig = {
    sourceProvider: pair.sourceProvider,
    sourcePlaylistId: pair.sourcePlaylistId,
    targetProvider: pair.targetProvider,
    targetPlaylistId: pair.targetPlaylistId,
    direction: pair.direction as 'bidirectional',
    syncPairId: pair.id,
  };

  return (
    <div className={cn(
      `${ROW_GRID} rounded-md border border-border px-3 py-1.5`,
      !bothConnected && 'opacity-50',
    )}>
      <div className="flex items-center gap-1.5 min-w-0">
        <ProviderGlyph providerId={pair.sourceProvider} />
        <span className="text-sm truncate" title={sourceName}>{sourceName}</span>
      </div>

      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <div className="flex items-center gap-1.5 min-w-0">
        <ProviderGlyph providerId={pair.targetProvider} />
        <span className="text-sm truncate" title={targetName}>{targetName}</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <SyncStatusBadge status={isSyncing ? 'executing' : pair.latestRun?.status} />
        {lastSyncTime && !isSyncing ? (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap" title={lastSyncTime}>
            {formatRelativeTime(lastSyncTime)}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Preview sync"
          disabled={!bothConnected || isSyncing}
          onClick={() => openPreview(pairConfig, true)}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Sync now"
          disabled={!bothConnected || isSyncing}
          onClick={() => execute.mutate(pairConfig)}
        >
          {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
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

function useProviderConnected(providerId: MusicProviderId): boolean {
  const authSummary = useAuthSummary();
  return authSummary[providerId].code === 'ok';
}

function SyncPairRowWithAuth({ pair }: { pair: SyncPairWithRun }) {
  const sourceConnected = useProviderConnected(pair.sourceProvider);
  const targetConnected = useProviderConnected(pair.targetProvider);
  return <SyncPairRow pair={pair} bothConnected={sourceConnected && targetConnected} />;
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

        <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Loading sync pairs...</p>
          )}

          {!isLoading && (!pairs || pairs.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sync pairs configured yet.
            </p>
          )}

          {pairs?.map((pair: SyncPairWithRun) => (
            <SyncPairRowWithAuth key={pair.id} pair={pair} />
          ))}
        </div>

        <div className="border-t border-border pt-2">
          <AddSyncPairForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
