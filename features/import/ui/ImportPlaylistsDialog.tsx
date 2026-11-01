'use client';

import { useCallback } from 'react';
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
import { Import, Loader2 } from 'lucide-react';
import { useImportDialogStore } from '@/features/import/stores/useImportDialogStore';
import { useImportActivityStore } from '@/features/import/stores/useImportActivityStore';
import { useStartImport } from '@/features/import/hooks/useStartImport';
import { ImportPlaylistsProgressView } from '@/features/import/ui/ImportPlaylistsProgressView';
import { SourcePlaylistPicker } from '@/features/import/ui/SourcePlaylistPicker';
import { useSelectionViewState } from '@/features/import/ui/useSelectionViewState';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { formatSyncInterval, type SyncIntervalOption } from '@/lib/sync/types';

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
                <SelectItem key={option} value={option}>{formatSyncInterval(option)}</SelectItem>
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
  const {
    sourceProvider,
    setSourceProvider,
    searchQuery,
    setSearchQuery,
    localTargetProvider,
    setLocalTargetProvider,
    transferMode,
    setTransferMode,
    syncInterval,
    setSyncInterval,
    syncIntervalOptions,
    sourceOptions,
    allPlaylists,
    isLoading,
    isFetchingNextPage,
    filteredPlaylists,
    selectedIds,
    togglePlaylist,
    toggleAll,
    allFilteredSelected,
    targetNamesLower,
    selectedCount,
    isSyncModeDisabled,
    syncCapacityMessage,
    canSubmit,
    handleImport,
  } = useSelectionViewState({
    targetProvider,
    onStartImport,
  });

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

        {syncCapacityMessage && (
          <p className="text-xs text-muted-foreground">
            {syncCapacityMessage}
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
        canSubmit={canSubmit}
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
