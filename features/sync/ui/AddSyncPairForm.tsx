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
import { Save, ArrowLeftRight, Eye, Loader2 } from 'lucide-react';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncSchedulerEnabled } from '@shared/hooks/useAppConfig';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncPair, SyncInterval } from '@/lib/sync/types';

/** Same grid as SyncPairRow: [left] [arrow] [right] [status] [actions] */
const ROW_GRID = 'grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-x-2';

function buildStatusMap(authSummary: ReturnType<typeof useAuthSummary>) {
  return {
    spotify: authSummary.spotify.code === 'ok' ? 'connected' : 'disconnected',
    tidal: authSummary.tidal.code === 'ok' ? 'connected' : 'disconnected',
  } satisfies Record<MusicProviderId, 'connected' | 'disconnected'>;
}

/** Provider picker + playlist selector combo used on each side of the form */
function ProviderPlaylistPicker({
  providerId,
  selectedPlaylistId,
  connectedProviders,
  statusMap,
  disabled,
  popoverContainer,
  onProviderChange,
  onPlaylistChange,
}: {
  providerId: MusicProviderId;
  selectedPlaylistId: string | null;
  connectedProviders: MusicProviderId[];
  statusMap: Record<MusicProviderId, 'connected' | 'disconnected'>;
  disabled: boolean;
  popoverContainer?: HTMLElement | null | undefined;
  onProviderChange: (id: MusicProviderId) => void;
  onPlaylistChange: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 min-w-0">
      <ProviderStatusDropdown
        context="panel"
        currentProviderId={providerId}
        providers={connectedProviders}
        statusMap={statusMap}
        hideWhenSingleConnected={false}
        onProviderChange={onProviderChange}
      />
      <div className="flex-1 min-w-0">
        <PlaylistSelector
          providerId={providerId}
          selectedPlaylistId={selectedPlaylistId}
          selectedPlaylistName=""
          onSelectPlaylist={(id) => onPlaylistChange(id)}
          disabled={disabled}
          popoverContainer={popoverContainer}
        />
      </div>
    </div>
  );
}

export interface AddSyncPairFormProps {
  popoverContainer?: HTMLElement | null | undefined;
  initialSourceProvider?: MusicProviderId;
  initialSourcePlaylistId?: string | null;
  initialTargetProvider?: MusicProviderId;
  initialTargetPlaylistId?: string | null;
  /** Show preview/sync-now buttons alongside add */
  showSyncActions?: boolean;
}

function resolveDefaults(
  connectedProviders: MusicProviderId[],
  props: AddSyncPairFormProps,
) {
  const defaultProvider = connectedProviders[0] ?? ('spotify' as MusicProviderId);
  return {
    sourceProvider: props.initialSourceProvider ?? defaultProvider,
    sourcePlaylistId: props.initialSourcePlaylistId ?? null,
    targetProvider: props.initialTargetProvider ?? defaultProvider,
    targetPlaylistId: props.initialTargetPlaylistId ?? null,
  };
}

function canSubmitForm(
  sourcePlaylistId: string | null,
  targetPlaylistId: string | null,
  sourceProvider: MusicProviderId,
  targetProvider: MusicProviderId,
  isPending: boolean,
): boolean {
  return !!sourcePlaylistId && !!targetPlaylistId && sourceProvider !== targetProvider && !isPending;
}

function SyncIntervalSelect({ value, onChange }: { value: SyncInterval; onChange: (v: SyncInterval) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SyncInterval)}>
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
  );
}

export function AddSyncPairForm(props: AddSyncPairFormProps) {
  const { popoverContainer, showSyncActions } = props;
  const allProviders = useAvailableProviders();
  const authSummary = useAuthSummary();
  const createPair = useCreateSyncPair();
  const schedulerEnabled = useSyncSchedulerEnabled();

  const statusMap = useMemo(() => buildStatusMap(authSummary), [authSummary]);
  const connectedProviders = useMemo(
    () => allProviders.filter((p) => statusMap[p] === 'connected'),
    [allProviders, statusMap],
  );

  const defaults = useMemo(() => resolveDefaults(connectedProviders, props), [connectedProviders, props]);

  const [sourceProvider, setSourceProvider] = useState<MusicProviderId>(defaults.sourceProvider);
  const [sourcePlaylistId, setSourcePlaylistId] = useState<string | null>(defaults.sourcePlaylistId);
  const [targetProvider, setTargetProvider] = useState<MusicProviderId>(defaults.targetProvider);
  const [targetPlaylistId, setTargetPlaylistId] = useState<string | null>(defaults.targetPlaylistId);
  const [syncInterval, setSyncInterval] = useState<SyncInterval>('off');

  const sourcePlaylistName = usePlaylistName(sourceProvider, sourcePlaylistId ?? '');
  const targetPlaylistName = usePlaylistName(targetProvider, targetPlaylistId ?? '');

  const canSubmit = canSubmitForm(sourcePlaylistId, targetPlaylistId, sourceProvider, targetProvider, createPair.isPending);

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
      <ProviderPlaylistPicker
        providerId={sourceProvider}
        selectedPlaylistId={sourcePlaylistId}
        connectedProviders={connectedProviders}
        statusMap={statusMap}
        disabled={connectedProviders.length === 0}
        popoverContainer={popoverContainer}
        onProviderChange={(id) => { setSourceProvider(id); setSourcePlaylistId(null); }}
        onPlaylistChange={setSourcePlaylistId}
      />

      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <ProviderPlaylistPicker
        providerId={targetProvider}
        selectedPlaylistId={targetPlaylistId}
        connectedProviders={connectedProviders}
        statusMap={statusMap}
        disabled={statusMap[targetProvider] !== 'connected'}
        popoverContainer={popoverContainer}
        onProviderChange={(id) => { setTargetProvider(id); setTargetPlaylistId(null); }}
        onPlaylistChange={setTargetPlaylistId}
      />

      {/* Status column — scheduling dropdown */}
      <div className="flex items-center gap-1.5 shrink-0">
        {schedulerEnabled && <SyncIntervalSelect value={syncInterval} onChange={setSyncInterval} />}
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

  const pairConfig = {
    sourceProvider,
    sourcePlaylistId: sourcePlaylistId ?? '',
    targetProvider,
    targetPlaylistId: targetPlaylistId ?? '',
    direction: 'bidirectional' as const,
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title="Preview sync"
      disabled={disabled}
      onClick={() => openPreview(pairConfig, true)}
    >
      <Eye className="h-3.5 w-3.5" />
    </Button>
  );
}
