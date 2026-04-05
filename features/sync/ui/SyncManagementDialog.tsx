'use client';

import { useState, useCallback } from 'react';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncPairs, useDeleteSyncPair } from '@features/sync/hooks/useSyncPairs';
import { useUpdateSyncPair } from '@features/sync/hooks/useUpdateSyncPair';
import type { SyncPairWithRun } from '@features/sync/hooks/useSyncPairs';
import { useSyncExecute } from '@features/sync/hooks/useSyncExecute';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { SyncRunStatusIcon } from '@features/sync/ui/SyncRunStatusIcon';
import { SyncRunResultDialog } from '@features/sync/ui/SyncRunResultDialog';
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
import { Play, Eye, Trash2, ArrowLeftRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSyncIntervalOptions, useSyncSchedulerEnabled } from '@shared/hooks/useAppConfig';
import { useProposedSyncPairs } from '@features/sync/hooks/useProposedSyncPairs';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncRunStatus } from '@/lib/sync/types';
import { formatRelativeTime } from '@shared/utils/formatRelativeTime';

const ROW_GRID = 'grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-x-2';

function buildPairConfig(pair: SyncPairWithRun) {
  return {
    sourceProvider: pair.sourceProvider,
    sourcePlaylistId: pair.sourcePlaylistId,
    targetProvider: pair.targetProvider,
    targetPlaylistId: pair.targetPlaylistId,
    direction: pair.direction as 'bidirectional',
    syncPairId: pair.id,
  };
}

function isNextRunScheduled(pair: SyncPairWithRun, showScheduler: boolean): boolean {
  if (!showScheduler || !pair.nextRunAt || pair.syncInterval === 'off') return false;
  return formatRelativeTime(pair.nextRunAt).startsWith('in ');
}

function getDisplayedStatus(isSyncing: boolean, runStatus: SyncRunStatus | undefined): SyncRunStatus | undefined {
  return isSyncing ? 'executing' : runStatus;
}

function LastSyncTimeLabel({ time }: { time: string }) {
  return (
    <span className="text-[10px] text-muted-foreground whitespace-nowrap" title={time}>
      {formatRelativeTime(time)}
    </span>
  );
}

function NextRunLabel({ nextRunAt }: { nextRunAt: string }) {
  return (
    <span
      className="text-[10px] text-muted-foreground whitespace-nowrap"
      title={`Next: ${nextRunAt}`}
    >
      next {formatRelativeTime(nextRunAt)}
    </span>
  );
}

function SyncPairStatusCell({ pair, isSyncing, showScheduler, onShowResult }: {
  pair: SyncPairWithRun;
  isSyncing: boolean;
  showScheduler: boolean;
  onShowResult: () => void;
}) {
  const lastSyncTime = pair.latestRun?.completedAt ?? pair.latestRun?.startedAt;
  const warningCount = pair.latestRun?.warnings?.length ?? 0;
  const showLastSync = !!lastSyncTime && !isSyncing;
  const showNextRun = isNextRunScheduled(pair, showScheduler);

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <SyncRunStatusIcon
        status={getDisplayedStatus(isSyncing, pair.latestRun?.status)}
        hasWarnings={warningCount > 0}
        onClick={pair.latestRun ? onShowResult : undefined}
      />
      {showLastSync && <LastSyncTimeLabel time={lastSyncTime} />}
      {showNextRun && <NextRunLabel nextRunAt={pair.nextRunAt!} />}
    </div>
  );
}

function SyncPairActions({ pair, bothConnected, isSyncing, showScheduler }: {
  pair: SyncPairWithRun;
  bothConnected: boolean;
  isSyncing: boolean;
  showScheduler: boolean;
}) {
  const openPreview = useSyncDialogStore((s) => s.openPreview);
  const deletePair = useDeleteSyncPair();
  const execute = useSyncExecute();
  const updatePair = useUpdateSyncPair();
  const configuredSyncIntervals = useSyncIntervalOptions();
  const pairConfig = buildPairConfig(pair);
  const actionsDisabled = !bothConnected || isSyncing;
  const intervalOptions = ['off', ...configuredSyncIntervals, pair.syncInterval]
    .filter((value, index, all) => all.indexOf(value) === index);

  return (
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
            {intervalOptions.map((interval) => (
              <SelectItem key={interval} value={interval}>{interval === 'off' ? 'Off' : interval}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Preview sync"
        disabled={actionsDisabled}
        onClick={() => openPreview(pairConfig, true)}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Sync now"
        disabled={actionsDisabled}
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
  );
}

function SyncPairRow({ pair, bothConnected, showScheduler }: { pair: SyncPairWithRun; bothConnected: boolean; showScheduler: boolean }) {
  const execute = useSyncExecute();
  const [showResultDialog, setShowResultDialog] = useState(false);

  const fetchedSourceName = usePlaylistName(pair.sourceProvider, pair.sourcePlaylistId);
  const fetchedTargetName = usePlaylistName(pair.targetProvider, pair.targetPlaylistId);
  const sourceName = pair.sourcePlaylistName || fetchedSourceName;
  const targetName = pair.targetPlaylistName || fetchedTargetName;
  const isExecutingBackground = pair.latestRun?.status === 'executing' && !pair.latestRun?.completedAt;
  const isSyncing = execute.isPending || isExecutingBackground;

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

        <SyncPairStatusCell
          pair={pair}
          isSyncing={isSyncing}
          showScheduler={showScheduler}
          onShowResult={() => setShowResultDialog(true)}
        />

        <SyncPairActions
          pair={pair}
          bothConnected={bothConnected}
          isSyncing={isSyncing}
          showScheduler={showScheduler}
        />
      </div>

      <SyncRunResultDialog
        run={pair.latestRun ?? null}
        open={showResultDialog}
        onClose={() => setShowResultDialog(false)}
      />
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
  const proposedPairs = useProposedSyncPairs(pairs);
  const schedulerEnabled = useSyncSchedulerEnabled();
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const overlayRef = useCallback((node: HTMLDivElement | null) => { setOverlayEl(node); }, []);

  return (
    <Dialog open={isManagementOpen} onOpenChange={(open) => { if (!open) closeManagement(); }}>
      <DialogContent className="max-w-2xl">
        {/* Overlay layer for popover portals — inside Dialog's DOM tree */}
        <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} />

        <DialogHeader>
          <DialogTitle>Sync Playlists</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border pb-2 space-y-1">
          {proposedPairs.length > 0
            ? proposedPairs.map((pair) => (
                <AddSyncPairForm
                  key={`${pair.sourceProvider}:${pair.sourcePlaylistId}-${pair.targetProvider}:${pair.targetPlaylistId}`}
                  popoverContainer={overlayEl}
                  initialSourceProvider={pair.sourceProvider}
                  initialSourcePlaylistId={pair.sourcePlaylistId}
                  initialTargetProvider={pair.targetProvider}
                  initialTargetPlaylistId={pair.targetPlaylistId}
                  showSyncActions
                />
              ))
            : <AddSyncPairForm popoverContainer={overlayEl} showSyncActions />
          }
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Loading sync pairs...</p>
          )}

          {!isLoading && pairs && pairs.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Saved sync pairs
              </h3>
              {pairs.map((pair: SyncPairWithRun) => (
                <SyncPairRowWithAuth key={pair.id} pair={pair} showScheduler={schedulerEnabled} />
              ))}
            </div>
          )}

          {!isLoading && (!pairs || pairs.length === 0) && proposedPairs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sync pairs configured yet. Open playlists in the split editor to see suggestions.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
