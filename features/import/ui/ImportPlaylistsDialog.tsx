'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Import, Loader2, Search } from 'lucide-react';
import { useImportDialogStore } from '@/features/import/stores/useImportDialogStore';
import { useImportActivityStore } from '@/features/import/stores/useImportActivityStore';
import { useStartImport } from '@/features/import/hooks/useStartImport';
import {
  useProviderPlaylists,
  usePlaylistSelection,
  useFilteredPlaylists,
} from '@/features/import/hooks/useProviderPlaylists';
import {
  ImportPlaylistSelectionRow,
} from '@/features/import/ui/ImportPlaylistStatusRow';
import { ImportPlaylistsProgressView } from '@/features/import/ui/ImportPlaylistsProgressView';
import { useSyncPairs } from '@features/sync/hooks/useSyncPairs';
import { useMaxSyncTasksPerUser, useSyncIntervalOptions } from '@shared/hooks/useAppConfig';
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncIntervalOption } from '@/lib/sync/types';

const AVAILABLE_PROVIDERS: Array<{ id: MusicProviderId; label: string }> = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'tidal', label: 'TIDAL' },
];

function getProviderLabel(id: string): string {
  return AVAILABLE_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

function ImportButtonLabel({ count, isPending }: { count: number; isPending: boolean }) {
  return (
    <>
      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Import {count > 0 ? `${count} Playlist${count === 1 ? '' : 's'}` : 'Playlists'}
    </>
  );
}

function PlaylistListContent({
  isLoading,
  allPlaylistsLength,
  filteredPlaylists,
  selectedIds,
  targetNamesLower,
  onToggle,
}: {
  isLoading: boolean;
  allPlaylistsLength: number;
  filteredPlaylists: Playlist[];
  selectedIds: Set<string>;
  targetNamesLower: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (isLoading && allPlaylistsLength === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading playlists...
      </div>
    );
  }

  if (filteredPlaylists.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No playlists found.
      </div>
    );
  }

  return (
    <>
      {filteredPlaylists.map((playlist) => (
        <ImportPlaylistSelectionRow
          key={playlist.id}
          playlist={playlist}
          isSelected={selectedIds.has(playlist.id)}
          onToggle={onToggle}
          hasDuplicate={targetNamesLower.has(playlist.name.toLowerCase())}
        />
      ))}
    </>
  );
}

function SourcePlaylistPicker({
  sourceProvider,
  sourceLabel,
  allPlaylists,
  isLoading,
  isFetchingNextPage,
  filteredPlaylists,
  selectedIds,
  targetNamesLower,
  togglePlaylist,
  toggleAll,
  allFilteredSelected,
  searchQuery,
  onSearchChange,
}: {
  sourceProvider: string;
  sourceLabel: string;
  allPlaylists: Playlist[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  filteredPlaylists: Playlist[];
  selectedIds: Set<string>;
  targetNamesLower: Set<string>;
  togglePlaylist: (id: string) => void;
  toggleAll: () => void;
  allFilteredSelected: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  if (!sourceProvider) return null;

  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${sourceLabel} playlists...`}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {allPlaylists.length} playlists loaded
          {isFetchingNextPage && ' (loading more...)'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleAll}
          disabled={filteredPlaylists.length === 0}
          className="h-7 text-xs"
        >
          {allFilteredSelected ? 'Deselect All' : 'Select All'}
        </Button>
      </div>

      <div className="max-h-64 overflow-auto rounded-md border border-input">
        <PlaylistListContent
          isLoading={isLoading}
          allPlaylistsLength={allPlaylists.length}
          filteredPlaylists={filteredPlaylists}
          selectedIds={selectedIds}
          targetNamesLower={targetNamesLower}
          onToggle={togglePlaylist}
        />
      </div>
    </>
  );
}

function TransferModePicker({
  mode,
  onModeChange,
  interval,
  intervalOptions,
  onIntervalChange,
  syncDisabled,
}: {
  mode: 'import' | 'sync';
  onModeChange: (mode: 'import' | 'sync') => void;
  interval: string;
  intervalOptions: SyncIntervalOption[];
  onIntervalChange: (interval: string) => void;
  syncDisabled: boolean;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">Transfer mode</label>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="transferMode"
            value="import"
            checked={mode === 'import'}
            onChange={() => onModeChange('import')}
            className="accent-primary"
          />
          One-time import
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="transferMode"
            value="sync"
            checked={mode === 'sync'}
            onChange={() => onModeChange('sync')}
            disabled={syncDisabled}
            className="accent-primary"
          />
          Keep in sync
        </label>
        {mode === 'sync' && (
          <Select value={interval} onValueChange={onIntervalChange}>
            <SelectTrigger className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function ProviderPickers({
  targetProvider,
  sourceProvider,
  localTargetProvider,
  sourceOptions,
  onSourceChange,
  onTargetChange,
}: {
  targetProvider: string | null;
  sourceProvider: string;
  localTargetProvider: string;
  sourceOptions: Array<{ id: MusicProviderId; label: string }>;
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
}) {
  if (targetProvider) {
    return (
      <div className="grid gap-2">
        <label className="text-sm font-medium">Source provider</label>
        <Select value={sourceProvider} onValueChange={onSourceChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select source provider" />
          </SelectTrigger>
          <SelectContent>
            {sourceOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="grid flex-1 gap-2">
        <label className="text-sm font-medium">Source</label>
        <Select value={sourceProvider} onValueChange={onSourceChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_PROVIDERS.filter((p) => p.id !== localTargetProvider).map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="mt-6 text-sm text-muted-foreground">&rarr;</span>
      <div className="grid flex-1 gap-2">
        <label className="text-sm font-medium">Target</label>
        <Select value={localTargetProvider} onValueChange={onTargetChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select target" />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_PROVIDERS.filter((p) => p.id !== sourceProvider).map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SelectionFooter({ selectedCount, isPending, canSubmit, transferMode, onImport }: {
  selectedCount: number;
  isPending: boolean;
  canSubmit: boolean;
  transferMode: 'import' | 'sync';
  onImport: () => void;
}) {
  const syncLabel = getTransferButtonLabel(transferMode, selectedCount);
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="outline"
        onClick={() => useImportDialogStore.getState().close()}
        disabled={isPending}
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={onImport}
        disabled={!canSubmit || isPending}
      >
        {syncLabel ?? <ImportButtonLabel count={selectedCount} isPending={isPending} />}
        {syncLabel && isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
      </Button>
    </DialogFooter>
  );
}

function buildTransferOptions(mode: 'import' | 'sync', interval: string) {
  if (mode === 'sync') return { createSyncPair: true, syncInterval: interval };
  return { createSyncPair: false };
}

function getTransferButtonLabel(mode: 'import' | 'sync', count: number): string | null {
  if (mode !== 'sync') return null;
  const suffix = count === 1 ? '' : 's';
  return count > 0 ? `Transfer & Sync ${count} Playlist${suffix}` : 'Transfer & Sync Playlists';
}

function SelectionView({
  targetProvider,
  onStartImport,
  isPending,
}: {
  targetProvider: string | null;
  onStartImport: (
    sourceProvider: string,
    targetProvider: string,
    playlists: Array<{ id: string; name: string }>,
    options?: { createSyncPair?: boolean; syncInterval?: string },
  ) => void;
  isPending: boolean;
}) {
  const [sourceProvider, setSourceProvider] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [localTargetProvider, setLocalTargetProvider] = useState<string>(targetProvider ?? '');
  const [transferMode, setTransferMode] = useState<'import' | 'sync'>('import');
  const syncIntervalOptions = useSyncIntervalOptions();
  const maxSyncTasksPerUser = useMaxSyncTasksPerUser();
  const { data: existingSyncPairs } = useSyncPairs();
  const [syncInterval, setSyncInterval] = useState<string>(() => syncIntervalOptions[0] ?? '1h');

  const effectiveTarget = targetProvider ?? localTargetProvider;

  const sourceOptions = useMemo(
    () => AVAILABLE_PROVIDERS.filter((p) => p.id !== effectiveTarget),
    [effectiveTarget],
  );

  // Auto-select the only available source when there is exactly one option
  useEffect(() => {
    if (sourceOptions.length === 1 && sourceOptions[0]) {
      setSourceProvider(sourceOptions[0].id);
    }
  }, [sourceOptions]);

  // Reset source if it collides with newly selected target
  useEffect(() => {
    if (sourceProvider && sourceProvider === effectiveTarget) {
      setSourceProvider('');
    }
  }, [sourceProvider, effectiveTarget]);

  useEffect(() => {
    if (!syncIntervalOptions.includes(syncInterval as SyncIntervalOption)) {
      setSyncInterval(syncIntervalOptions[0] ?? '1h');
    }
  }, [syncInterval, syncIntervalOptions]);

  const { allPlaylists, isLoading, isFetchingNextPage } = useProviderPlaylists(
    sourceProvider || null,
  );

  const { allPlaylists: targetPlaylists } = useProviderPlaylists(effectiveTarget || null);

  const targetNamesLower = useMemo(() => {
    const names = new Set<string>();
    for (const p of targetPlaylists) {
      names.add(p.name.toLowerCase());
    }
    return names;
  }, [targetPlaylists]);

  const filteredPlaylists = useFilteredPlaylists(allPlaylists, searchQuery);

  const { selectedIds, togglePlaylist, toggleAll, allFilteredSelected } =
    usePlaylistSelection(filteredPlaylists);

  const handleImport = useCallback(() => {
    const selected = allPlaylists
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
    if (selected.length === 0 || !effectiveTarget) return;
    const options = buildTransferOptions(transferMode, syncInterval);
    onStartImport(sourceProvider, effectiveTarget, selected, options);
  }, [allPlaylists, selectedIds, sourceProvider, effectiveTarget, onStartImport, transferMode, syncInterval]);

  const selectedCount = selectedIds.size;
  const existingSyncTaskCount = existingSyncPairs?.length ?? 0;
  const remainingSyncSlots = maxSyncTasksPerUser === null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, maxSyncTasksPerUser - existingSyncTaskCount);
  const isSyncModeDisabled = remainingSyncSlots <= 0;

  useEffect(() => {
    if (isSyncModeDisabled && transferMode === 'sync') {
      setTransferMode('import');
    }
  }, [isSyncModeDisabled, transferMode]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Import className="h-5 w-5" />
          Import Playlists
        </DialogTitle>
        <DialogDescription>
          {targetProvider
            ? `Copy playlists from another provider into ${getProviderLabel(targetProvider)}.`
            : 'Copy or sync playlists between providers.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <ProviderPickers
          targetProvider={targetProvider}
          sourceProvider={sourceProvider}
          localTargetProvider={localTargetProvider}
          sourceOptions={sourceOptions}
          onSourceChange={setSourceProvider}
          onTargetChange={setLocalTargetProvider}
        />

        <TransferModePicker
          mode={transferMode}
          onModeChange={setTransferMode}
          interval={syncInterval}
          intervalOptions={syncIntervalOptions}
          onIntervalChange={setSyncInterval}
          syncDisabled={isSyncModeDisabled}
        />

        {maxSyncTasksPerUser !== null && (
          <p className="text-xs text-muted-foreground">
            {isSyncModeDisabled
              ? `Sync task limit reached (${existingSyncTaskCount}/${maxSyncTasksPerUser}).`
              : transferMode === 'sync' && Number.isFinite(remainingSyncSlots) && selectedCount > remainingSyncSlots
                ? `Only ${remainingSyncSlots} of ${selectedCount} selected playlists can become sync tasks (${existingSyncTaskCount}/${maxSyncTasksPerUser} already used).`
                : `${remainingSyncSlots} sync task slot${remainingSyncSlots === 1 ? '' : 's'} remaining (${existingSyncTaskCount}/${maxSyncTasksPerUser} used).`}
          </p>
        )}

        <SourcePlaylistPicker
          sourceProvider={sourceProvider}
          sourceLabel={getProviderLabel(sourceProvider)}
          allPlaylists={allPlaylists}
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          filteredPlaylists={filteredPlaylists}
          selectedIds={selectedIds}
          targetNamesLower={targetNamesLower}
          togglePlaylist={togglePlaylist}
          toggleAll={toggleAll}
          allFilteredSelected={allFilteredSelected}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

      <SelectionFooter
        selectedCount={selectedCount}
        isPending={isPending}
        canSubmit={selectedCount > 0 && !!sourceProvider && !!effectiveTarget && (transferMode !== 'sync' || remainingSyncSlots > 0)}
        transferMode={transferMode}
        onImport={handleImport}
      />
    </>
  );
}

export function ImportPlaylistsDialog() {
  const { isOpen, targetProvider } = useImportDialogStore();
  const close = useImportDialogStore((s) => s.close);
  const activeJobId = useImportActivityStore((s) => s.activeImportJobId);
  const isImportActive = useImportActivityStore((s) => s.isImportActive);
  const hasUnacknowledgedCompletion = useImportActivityStore((s) => s.hasUnacknowledgedCompletion);
  const startImport = useStartImport();
  const shouldShowProgress = !!activeJobId && (isImportActive || hasUnacknowledgedCompletion);

  const handleStartImport = useCallback(
    (
      sourceProvider: string,
      effectiveTarget: string,
      playlists: Array<{ id: string; name: string }>,
      options?: { createSyncPair?: boolean; syncInterval?: string },
    ) => {
      if (!effectiveTarget) return;
      startImport.mutate({
        sourceProvider,
        targetProvider: effectiveTarget,
        playlists,
        createSyncPair: options?.createSyncPair,
        syncInterval: options?.syncInterval,
      });
    },
    [startImport],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-[520px]">
        {shouldShowProgress ? (
          <ImportPlaylistsProgressView jobId={activeJobId} />
        ) : (
          <SelectionView
            targetProvider={targetProvider}
            onStartImport={handleStartImport}
            isPending={startImport.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
