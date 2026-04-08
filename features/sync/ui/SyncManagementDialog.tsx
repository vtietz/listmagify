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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Play, Eye, Trash2, ArrowLeftRight, Loader2, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSyncIntervalOptions, useSyncSchedulerEnabled, useSyncSchedulerTickMs } from '@shared/hooks/useAppConfig';
import { useProposedSyncPairs } from '@features/sync/hooks/useProposedSyncPairs';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncRunStatus } from '@/lib/sync/types';
import { formatRelativeTime } from '@shared/utils/formatRelativeTime';

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(120px,auto)_auto] items-center gap-x-2';

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
  return showScheduler && pair.syncInterval !== 'off';
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
  const relative = formatRelativeTime(nextRunAt);
  const label = relative.startsWith('in ')
    ? `next ${relative}`
    : relative === 'just now'
      ? 'due now'
      : `due ${relative}`;

  return (
    <span
      className="text-[10px] text-muted-foreground whitespace-nowrap"
      title={`Next: ${nextRunAt}`}
    >
      {label}
    </span>
  );
}

function NextRunMissingLabel() {
  return (
    <span
      className="text-[10px] text-muted-foreground whitespace-nowrap"
      title="Next run will be scheduled shortly"
    >
      next pending
    </span>
  );
}

function renderNextRunNode(showNextRun: boolean, nextRunAt: string | null) {
  if (!showNextRun) return null;
  if (!nextRunAt) return <NextRunMissingLabel />;
  return <NextRunLabel nextRunAt={nextRunAt} />;
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
    <div className="flex items-center justify-end gap-1.5 shrink-0 text-right">
      <SyncRunStatusIcon
        status={getDisplayedStatus(isSyncing, pair.latestRun?.status)}
        hasWarnings={warningCount > 0}
        onClick={pair.latestRun ? onShowResult : undefined}
      />
      {showLastSync && <LastSyncTimeLabel time={lastSyncTime} />}
      {renderNextRunNode(showNextRun, pair.nextRunAt)}
    </div>
  );
}

function SyncPairActions({ pair, bothConnected, isSyncing, showScheduler, intervalOpen, onIntervalOpenChange, popoverContainer }: {
  pair: SyncPairWithRun;
  bothConnected: boolean;
  isSyncing: boolean;
  showScheduler: boolean;
  intervalOpen: boolean;
  onIntervalOpenChange: (open: boolean) => void;
  popoverContainer: HTMLDivElement | null;
}) {
  const openPreview = useSyncDialogStore((s) => s.openPreview);
  const isPreviewRunning = useSyncDialogStore((s) => Object.values(s.previewSessions).some((session) => {
    if (session.status !== 'running') return false;

    const config = session.config;
    return config.syncPairId === pair.id
      || (
        config.sourceProvider === pair.sourceProvider
        && config.sourcePlaylistId === pair.sourcePlaylistId
        && config.targetProvider === pair.targetProvider
        && config.targetPlaylistId === pair.targetPlaylistId
      );
  }));
  const deletePair = useDeleteSyncPair();
  const execute = useSyncExecute();
  const updatePair = useUpdateSyncPair();
  const configuredSyncIntervals = useSyncIntervalOptions();
  const pairConfig = buildPairConfig(pair);
  const actionsDisabled = !bothConnected || isSyncing;
  const intervalOptions = ['off', ...configuredSyncIntervals, pair.syncInterval]
    .filter((value, index, all) => all.indexOf(value) === index);
  const intervalLabel = pair.syncInterval === 'off' ? 'Off' : pair.syncInterval;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {showScheduler && (
        <Popover open={intervalOpen} onOpenChange={onIntervalOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-7 w-[68px] text-xs px-2 justify-between"
              disabled={!bothConnected}
              title="Sync interval"
            >
              <span>{intervalLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            container={popoverContainer}
            align="end"
            className="w-[88px] p-1"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className="space-y-0.5">
              {intervalOptions.map((interval) => {
                const isSelected = (pair.syncInterval ?? 'off') === interval;

                return (
                  <Button
                    key={interval}
                    type="button"
                    variant="ghost"
                    className="h-7 w-full justify-between px-2 text-xs"
                    onClick={() => {
                      updatePair.mutate({ id: pair.id, syncInterval: interval });
                      onIntervalOpenChange(false);
                    }}
                  >
                    <span>{interval === 'off' ? 'Off' : interval}</span>
                    {isSelected && <Check className="h-3 w-3" />}
                  </Button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={isPreviewRunning ? 'Preview is running' : 'Preview sync'}
        disabled={actionsDisabled}
        onClick={() => openPreview(pairConfig, true)}
      >
        {isPreviewRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
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

function SyncPairRow({
  pair,
  bothConnected,
  showScheduler,
  isIntervalOpen,
  onIntervalOpenChange,
  popoverContainer,
}: {
  pair: SyncPairWithRun;
  bothConnected: boolean;
  showScheduler: boolean;
  isIntervalOpen: boolean;
  onIntervalOpenChange: (open: boolean) => void;
  popoverContainer: HTMLDivElement | null;
}) {
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
          intervalOpen={isIntervalOpen}
          onIntervalOpenChange={onIntervalOpenChange}
          popoverContainer={popoverContainer}
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

function SyncPairRowWithAuth({
  pair,
  showScheduler,
  isIntervalOpen,
  onIntervalOpenChange,
  popoverContainer,
}: {
  pair: SyncPairWithRun;
  showScheduler: boolean;
  isIntervalOpen: boolean;
  onIntervalOpenChange: (open: boolean) => void;
  popoverContainer: HTMLDivElement | null;
}) {
  const sourceConnected = useProviderConnected(pair.sourceProvider);
  const targetConnected = useProviderConnected(pair.targetProvider);
  return (
    <SyncPairRow
      pair={pair}
      bothConnected={sourceConnected && targetConnected}
      showScheduler={showScheduler}
      isIntervalOpen={isIntervalOpen}
      onIntervalOpenChange={onIntervalOpenChange}
      popoverContainer={popoverContainer}
    />
  );
}

export function SyncManagementDialog() {
  const isManagementOpen = useSyncDialogStore((s) => s.isManagementOpen);
  const closeManagement = useSyncDialogStore((s) => s.closeManagement);
  const { data: pairs, isLoading } = useSyncPairs(isManagementOpen);
  const proposedPairs = useProposedSyncPairs(pairs);
  const schedulerEnabled = useSyncSchedulerEnabled();
  const schedulerTickMs = useSyncSchedulerTickMs();
  const schedulerTickSec = Math.max(1, Math.round(schedulerTickMs / 1000));
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [openIntervalPairId, setOpenIntervalPairId] = useState<string | null>(null);
  const overlayRef = useCallback((node: HTMLDivElement | null) => { setOverlayEl(node); }, []);

  return (
    <Dialog
      open={isManagementOpen}
      onOpenChange={(open) => {
        if (!open) {
          setOpenIntervalPairId(null);
          closeManagement();
        }
      }}
    >
      <DialogContent className="max-w-2xl flex flex-col">
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

        <div className="max-h-[60vh] overflow-y-scroll space-y-1.5 flex-1">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Loading sync pairs...</p>
          )}

          {!isLoading && pairs && pairs.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Saved sync pairs
              </h3>
              {schedulerEnabled && (
                <p className="text-[10px] text-muted-foreground">
                  Scheduler checks due pairs about every {schedulerTickSec}s.
                </p>
              )}
              {pairs.map((pair: SyncPairWithRun) => (
                <SyncPairRowWithAuth
                  key={pair.id}
                  pair={pair}
                  showScheduler={schedulerEnabled}
                  isIntervalOpen={openIntervalPairId === pair.id}
                  onIntervalOpenChange={(open) => setOpenIntervalPairId(open ? pair.id : null)}
                  popoverContainer={overlayEl}
                />
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
