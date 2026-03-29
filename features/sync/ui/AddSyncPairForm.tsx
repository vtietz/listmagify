'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlaylistSelector } from '@/components/split-editor/playlist/PlaylistSelector';
import { ProviderStatusDropdown } from '@/components/auth/ProviderStatusDropdown';
import { useAvailableProviders } from '@shared/hooks/useAvailableProviders';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import { useCreateSyncPair } from '@features/sync/hooks/useSyncPairs';
import { usePlaylistName } from '@features/sync/hooks/usePlaylistName';
import { Save, ArrowLeftRight, Eye, Play, Loader2 } from 'lucide-react';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncExecute } from '@features/sync/hooks/useSyncExecute';
import { useSyncSchedulerEnabled } from '@shared/hooks/useAppConfig';
import { SyncRunStatusIcon } from '@features/sync/ui/SyncRunStatusIcon';
import { SyncRunResultContent } from '@features/sync/ui/SyncRunResultContent';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncPair, SyncInterval, SyncApplyResult } from '@/lib/sync/types';

/** Same grid as SyncPairRow: [left] [arrow] [right] [status] [actions] */
const ROW_GRID = 'grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-x-2';

export interface AddSyncPairFormProps {
  popoverContainer?: HTMLElement | null | undefined;
  initialSourceProvider?: MusicProviderId;
  initialSourcePlaylistId?: string | null;
  initialTargetProvider?: MusicProviderId;
  initialTargetPlaylistId?: string | null;
  /** Show preview/sync-now buttons alongside add */
  showSyncActions?: boolean;
}

export function AddSyncPairForm({
  popoverContainer,
  initialSourceProvider,
  initialSourcePlaylistId,
  initialTargetProvider,
  initialTargetPlaylistId,
  showSyncActions,
}: AddSyncPairFormProps) {
  const allProviders = useAvailableProviders();
  const authSummary = useAuthSummary();
  const createPair = useCreateSyncPair();
  const schedulerEnabled = useSyncSchedulerEnabled();

  const statusMap = useMemo(() => ({
    spotify: authSummary.spotify.code === 'ok' ? 'connected' : 'disconnected',
    tidal: authSummary.tidal.code === 'ok' ? 'connected' : 'disconnected',
  } satisfies Record<MusicProviderId, 'connected' | 'disconnected'>), [authSummary]);

  const connectedProviders = useMemo(
    () => allProviders.filter((p) => statusMap[p] === 'connected'),
    [allProviders, statusMap],
  );

  const defaultProvider = connectedProviders[0] ?? 'spotify';

  const [sourceProvider, setSourceProvider] = useState<MusicProviderId>(initialSourceProvider ?? defaultProvider);
  const [sourcePlaylistId, setSourcePlaylistId] = useState<string | null>(initialSourcePlaylistId ?? null);
  const [targetProvider, setTargetProvider] = useState<MusicProviderId>(initialTargetProvider ?? defaultProvider);
  const [targetPlaylistId, setTargetPlaylistId] = useState<string | null>(initialTargetPlaylistId ?? null);
  const [syncInterval, setSyncInterval] = useState<SyncInterval>('off');

  const sourcePlaylistName = usePlaylistName(sourceProvider, sourcePlaylistId ?? '');
  const targetPlaylistName = usePlaylistName(targetProvider, targetPlaylistId ?? '');

  const isSameProvider = sourceProvider === targetProvider;
  const canSubmit = sourcePlaylistId && targetPlaylistId && !isSameProvider && !createPair.isPending;

  function handleSubmit() {
    if (!sourcePlaylistId || !targetPlaylistId) return;

    createPair.mutate(
      {
        sourceProvider,
        sourcePlaylistId,
        sourcePlaylistName,
        targetProvider,
        targetPlaylistId,
        targetPlaylistName,
        direction: 'bidirectional',
        autoSync: syncInterval !== 'off',
        syncInterval,
        nextRunAt: null,
        consecutiveFailures: 0,
      },
      {
        onSuccess: (_pair: SyncPair) => {
          setSourcePlaylistId(null);
          setTargetPlaylistId(null);
          setSyncInterval('off');
        },
      },
    );
  }

  if (connectedProviders.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">
        Log in to a provider to create sync pairs.
      </p>
    );
  }

  return (
    <div className={`${ROW_GRID} py-1.5`}>
      {/* Left: provider + playlist */}
      <div className="flex items-center gap-0.5 min-w-0">
        <ProviderStatusDropdown
          context="panel"
          currentProviderId={sourceProvider}
          providers={connectedProviders}
          statusMap={statusMap}
          hideWhenSingleConnected={false}
          onProviderChange={(id) => { setSourceProvider(id); setSourcePlaylistId(null); }}
        />
        <div className="flex-1 min-w-0">
          <PlaylistSelector
            providerId={sourceProvider}
            selectedPlaylistId={sourcePlaylistId}
            selectedPlaylistName=""
            onSelectPlaylist={(id) => setSourcePlaylistId(id)}
            disabled={connectedProviders.length === 0}
            popoverContainer={popoverContainer}
          />
        </div>
      </div>

      {/* Arrow */}
      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      {/* Right: provider + playlist */}
      <div className="flex items-center gap-0.5 min-w-0">
        <ProviderStatusDropdown
          context="panel"
          currentProviderId={targetProvider}
          providers={connectedProviders}
          statusMap={statusMap}
          hideWhenSingleConnected={false}
          onProviderChange={(id) => { setTargetProvider(id); setTargetPlaylistId(null); }}
        />
        <div className="flex-1 min-w-0">
          <PlaylistSelector
            providerId={targetProvider}
            selectedPlaylistId={targetPlaylistId}
            selectedPlaylistName=""
            onSelectPlaylist={(id) => setTargetPlaylistId(id)}
            disabled={statusMap[targetProvider] !== 'connected'}
            popoverContainer={popoverContainer}
          />
        </div>
      </div>

      {/* Status column — scheduling dropdown */}
      <div className="flex items-center gap-1.5 shrink-0">
        {schedulerEnabled && (
          <Select
            value={syncInterval}
            onValueChange={(value) => setSyncInterval(value as SyncInterval)}
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
      </div>

      {/* Actions column */}
      <div className="flex items-center gap-0.5 shrink-0">
        {showSyncActions && (
          <SyncActionButtons
            sourceProvider={sourceProvider}
            sourcePlaylistId={sourcePlaylistId}
            targetProvider={targetProvider}
            targetPlaylistId={targetPlaylistId}
            disabled={!canSubmit}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Save sync pair"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {createPair.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function SyncActionButtons({
  sourceProvider,
  sourcePlaylistId,
  targetProvider,
  targetPlaylistId,
  disabled,
}: {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string | null;
  targetProvider: MusicProviderId;
  targetPlaylistId: string | null;
  disabled: boolean;
}) {
  const openPreview = useSyncDialogStore((s) => s.openPreview);
  const execute = useSyncExecute();
  const isSyncing = execute.isPending;
  const [lastResult, setLastResult] = useState<SyncApplyResult | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);

  const pairConfig = {
    sourceProvider,
    sourcePlaylistId: sourcePlaylistId ?? '',
    targetProvider,
    targetPlaylistId: targetPlaylistId ?? '',
    direction: 'bidirectional' as const,
  };

  const hasWarnings = (lastResult?.unresolved.length ?? 0) > 0;
  const hasErrors = (lastResult?.errors.length ?? 0) > 0;
  const lastStatus = lastResult ? (hasErrors ? 'failed' : 'done') : null;

  return (
    <>
      {lastResult && (
        <SyncRunStatusIcon
          status={lastStatus as 'done' | 'failed'}
          hasWarnings={hasWarnings}
          onClick={() => setShowResultDialog(true)}
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Preview sync"
        disabled={disabled || isSyncing}
        onClick={() => openPreview(pairConfig, true)}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Sync now"
        disabled={disabled || isSyncing}
        onClick={() => execute.mutate(pairConfig, {
          onSuccess: (data: { result: SyncApplyResult }) => setLastResult(data.result),
        })}
      >
        {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      {lastResult && (
        <Dialog open={showResultDialog} onOpenChange={(o) => { if (!o) setShowResultDialog(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Sync result</DialogTitle>
            </DialogHeader>
            <SyncRunResultContent source={lastResult} />
            <DialogFooter>
              <Button onClick={() => setShowResultDialog(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
