'use client';

import { useState, useCallback } from 'react';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncPairs, useDeleteSyncPair } from '@features/sync/hooks/useSyncPairs';
import { useUpdateSyncPair } from '@features/sync/hooks/useUpdateSyncPair';
import type { SyncPairWithRun } from '@features/sync/hooks/useSyncPairs';
import { useSyncExecute } from '@features/sync/hooks/useSyncExecute';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { SyncStatusBadge } from '@features/sync/ui/SyncStatusBadge';
import { SyncRunHistoryPanel } from '@features/sync/ui/SyncRunHistoryPanel';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, Eye, Trash2, ArrowLeftRight, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSyncSchedulerEnabled } from '@shared/hooks/useAppConfig';
import type { MusicProviderId } from '@/lib/music-provider/types';

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const absDiff = Math.abs(diff);
  const isFuture = diff < 0;
  const minutes = Math.floor(absDiff / 60000);
  if (minutes < 1) return isFuture ? 'in <1m' : 'just now';
  if (minutes < 60) return isFuture ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isFuture ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

const ROW_GRID = 'grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-x-2';

function SyncPairRow({ pair, bothConnected, showScheduler }: { pair: SyncPairWithRun; bothConnected: boolean; showScheduler: boolean }) {
  const openPreview = useSyncDialogStore((s) => s.openPreview);
  const deletePair = useDeleteSyncPair();
  const execute = useSyncExecute();
  const updatePair = useUpdateSyncPair();
  const [showHistory, setShowHistory] = useState(false);

  const fetchedSourceName = usePlaylistName(pair.sourceProvider, pair.sourcePlaylistId);
  const fetchedTargetName = usePlaylistName(pair.targetProvider, pair.targetPlaylistId);
  const sourceName = pair.sourcePlaylistName || fetchedSourceName;
  const targetName = pair.targetPlaylistName || fetchedTargetName;
  const lastSyncTime = pair.latestRun?.completedAt ?? pair.latestRun?.startedAt;
  const isSyncing = execute.isPending;
  const warningCount = pair.latestRun?.warnings?.length ?? 0;

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
      'rounded-md border border-border',
      !bothConnected && 'opacity-50',
    )}>
      <div className={cn(`${ROW_GRID} px-3 py-1.5`)}>
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
          {showScheduler && pair.nextRunAt && pair.syncInterval !== 'off' ? (
            <span
              className="text-[10px] text-muted-foreground whitespace-nowrap"
              title={`Next: ${pair.nextRunAt}`}
            >
              next {formatRelativeTime(pair.nextRunAt)}
            </span>
          ) : null}
          {(pair.consecutiveFailures ?? 0) > 0 ? (
            <span
              className="text-[10px] text-amber-500"
              title={`${pair.consecutiveFailures} consecutive failures`}
            >
              !
            </span>
          ) : null}
          {warningCount > 0 ? (
            <span className="text-[10px] text-amber-500 whitespace-nowrap">
              {warningCount} unmatched
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {showScheduler && (
            <Select
              value={pair.syncInterval ?? 'off'}
              onValueChange={(value) => updatePair.mutate({ id: pair.id, syncInterval: value })}
              disabled={!bothConnected}
            >
              <SelectTrigger className="h-7 w-[68px] text-xs px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="15m">15m</SelectItem>
                <SelectItem value="30m">30m</SelectItem>
                <SelectItem value="1h">1h</SelectItem>
                <SelectItem value="6h">6h</SelectItem>
                <SelectItem value="12h">12h</SelectItem>
                <SelectItem value="24h">24h</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Sync history"
            onClick={() => setShowHistory(!showHistory)}
          >
            <Clock className="h-3.5 w-3.5" />
          </Button>
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
      {showHistory ? (
        <div className="px-3 py-2 bg-muted/30 border-t border-border/50">
          <SyncRunHistoryPanel pairId={pair.id} />
        </div>
      ) : null}
    </div>
  );
}

function useProviderConnected(providerId: MusicProviderId): boolean {
  const authSummary = useAuthSummary();
  return authSummary[providerId].code === 'ok';
}

function SyncPairRowWithAuth({ pair, showScheduler }: { pair: SyncPairWithRun; showScheduler: boolean }) {
  const sourceConnected = useProviderConnected(pair.sourceProvider);
  const targetConnected = useProviderConnected(pair.targetProvider);
  return <SyncPairRow pair={pair} bothConnected={sourceConnected && targetConnected} showScheduler={showScheduler} />;
}

export function SyncManagementDialog() {
  const isManagementOpen = useSyncDialogStore((s) => s.isManagementOpen);
  const closeManagement = useSyncDialogStore((s) => s.closeManagement);
  const { data: pairs, isLoading } = useSyncPairs(isManagementOpen);
  const schedulerEnabled = useSyncSchedulerEnabled();
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const overlayRef = useCallback((node: HTMLDivElement | null) => { setOverlayEl(node); }, []);

  return (
    <Dialog open={isManagementOpen} onOpenChange={(open) => { if (!open) closeManagement(); }}>
      <DialogContent className="max-w-2xl">
        {/* Overlay layer for popover portals — inside Dialog's DOM tree */}
        <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} />

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
            <SyncPairRowWithAuth key={pair.id} pair={pair} showScheduler={schedulerEnabled} />
          ))}
        </div>

        <div className="border-t border-border pt-2">
          <AddSyncPairForm popoverContainer={overlayEl} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
