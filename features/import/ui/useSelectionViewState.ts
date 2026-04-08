import { useState, useMemo, useCallback, useEffect } from 'react';
import { useProviderPlaylists, usePlaylistSelection, useFilteredPlaylists } from '@/features/import/hooks/useProviderPlaylists';
import { useSyncPairs } from '@features/sync/hooks/useSyncPairs';
import { useMaxSyncTasksPerUser, useSyncIntervalOptions } from '@shared/hooks/useAppConfig';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncIntervalOption } from '@/lib/sync/types';

const AVAILABLE_PROVIDERS: Array<{ id: MusicProviderId; label: string }> = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'tidal', label: 'TIDAL' },
];

function buildTransferOptions(mode: 'import' | 'sync', interval: string) {
  if (mode === 'sync') return { createSyncPair: true, syncInterval: interval };
  return { createSyncPair: false };
}

function canSubmitSelection(params: {
  selectedCount: number;
  sourceProvider: string;
  effectiveTarget: string;
  transferMode: 'import' | 'sync';
  remainingSyncSlots: number;
}): boolean {
  const hasRequiredSelection = params.selectedCount > 0 && !!params.sourceProvider && !!params.effectiveTarget;
  const hasSyncCapacity = params.transferMode !== 'sync' || params.remainingSyncSlots > 0;
  return hasRequiredSelection && hasSyncCapacity;
}

function getSyncCapacityMessage(params: {
  maxSyncTasksPerUser: number | null;
  isSyncModeDisabled: boolean;
  existingSyncTaskCount: number;
  selectedCount: number;
  remainingSyncSlots: number;
  transferMode: 'import' | 'sync';
}): string | null {
  if (params.maxSyncTasksPerUser === null) {
    return null;
  }

  if (params.isSyncModeDisabled) {
    return `Sync task limit reached (${params.existingSyncTaskCount}/${params.maxSyncTasksPerUser}).`;
  }

  if (
    params.transferMode === 'sync'
    && Number.isFinite(params.remainingSyncSlots)
    && params.selectedCount > params.remainingSyncSlots
  ) {
    return `Only ${params.remainingSyncSlots} of ${params.selectedCount} selected playlists can become sync tasks (${params.existingSyncTaskCount}/${params.maxSyncTasksPerUser} already used).`;
  }

  return `${params.remainingSyncSlots} sync task slot${params.remainingSyncSlots === 1 ? '' : 's'} remaining (${params.existingSyncTaskCount}/${params.maxSyncTasksPerUser} used).`;
}

export function useSelectionViewState(params: {
  targetProvider: string | null;
  onStartImport: (
    sourceProvider: string,
    targetProvider: string,
    playlists: Array<{ id: string; name: string }>,
    options?: { createSyncPair?: boolean; syncInterval?: string },
  ) => void;
}) {
  const { targetProvider, onStartImport } = params;
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

  useEffect(() => {
    if (sourceOptions.length === 1 && sourceOptions[0]) {
      setSourceProvider(sourceOptions[0].id);
    }
  }, [sourceOptions]);

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

  const { allPlaylists, isLoading, isFetchingNextPage } = useProviderPlaylists(sourceProvider || null);
  const { allPlaylists: targetPlaylists } = useProviderPlaylists(effectiveTarget || null);

  const targetNamesLower = useMemo(() => {
    const names = new Set<string>();
    for (const p of targetPlaylists) {
      names.add(p.name.toLowerCase());
    }
    return names;
  }, [targetPlaylists]);

  const filteredPlaylists = useFilteredPlaylists(allPlaylists, searchQuery);
  const { selectedIds, togglePlaylist, toggleAll, allFilteredSelected } = usePlaylistSelection(filteredPlaylists);

  const handleImport = useCallback(() => {
    const selected = allPlaylists
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
    if (selected.length === 0 || !effectiveTarget) return;

    const options = buildTransferOptions(transferMode, syncInterval);
    onStartImport(sourceProvider, effectiveTarget, selected, options);
  }, [allPlaylists, selectedIds, effectiveTarget, transferMode, syncInterval, onStartImport, sourceProvider]);

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

  const syncCapacityMessage = getSyncCapacityMessage({
    maxSyncTasksPerUser,
    isSyncModeDisabled,
    existingSyncTaskCount,
    selectedCount,
    remainingSyncSlots,
    transferMode,
  });

  const canSubmit = canSubmitSelection({
    selectedCount,
    sourceProvider,
    effectiveTarget,
    transferMode,
    remainingSyncSlots,
  });

  return {
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
  };
}
