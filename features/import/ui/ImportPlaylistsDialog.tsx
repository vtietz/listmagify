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
import { useStartImport } from '@/features/import/hooks/useStartImport';
import { useImportJob, type ImportJobData } from '@/features/import/hooks/useImportJob';
import {
  useProviderPlaylists,
  usePlaylistSelection,
  useFilteredPlaylists,
} from '@/features/import/hooks/useProviderPlaylists';
import {
  ImportPlaylistSelectionRow,
  ImportPlaylistProgressRow,
} from '@/features/import/ui/ImportPlaylistStatusRow';
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

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

function SelectionView({
  targetProvider,
  onStartImport,
  isPending,
}: {
  targetProvider: string;
  onStartImport: (
    sourceProvider: string,
    playlists: Array<{ id: string; name: string }>,
  ) => void;
  isPending: boolean;
}) {
  const [sourceProvider, setSourceProvider] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const sourceOptions = useMemo(
    () => AVAILABLE_PROVIDERS.filter((p) => p.id !== targetProvider),
    [targetProvider],
  );

  // Auto-select the only available source when there is exactly one option
  useEffect(() => {
    if (sourceOptions.length === 1 && sourceOptions[0]) {
      setSourceProvider(sourceOptions[0].id);
    }
  }, [sourceOptions]);

  const { allPlaylists, isLoading, isFetchingNextPage } = useProviderPlaylists(
    sourceProvider || null,
  );

  const { allPlaylists: targetPlaylists } = useProviderPlaylists(targetProvider);

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
    if (selected.length > 0) {
      onStartImport(sourceProvider, selected);
    }
  }, [allPlaylists, selectedIds, sourceProvider, onStartImport]);

  const selectedCount = selectedIds.size;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Import className="h-5 w-5" />
          Import Playlists
        </DialogTitle>
        <DialogDescription>
          Copy playlists from another provider into {getProviderLabel(targetProvider)}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium">Source provider</label>
          <Select value={sourceProvider} onValueChange={setSourceProvider}>
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
          onClick={handleImport}
          disabled={selectedCount === 0 || isPending || !sourceProvider}
        >
          <ImportButtonLabel count={selectedCount} isPending={isPending} />
        </Button>
      </DialogFooter>
    </>
  );
}

function ProgressViewContent({ data }: { data: ImportJobData }) {
  const { job, playlists } = data;
  const isComplete = job.status === 'done' || job.status === 'failed';
  const doneCount = playlists.filter((p) => p.status === 'done').length;
  const failedCount = playlists.filter((p) => p.status === 'failed').length;
  const partialCount = playlists.filter((p) => p.status === 'partial').length;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Import className="h-5 w-5" />
          {isComplete ? 'Import Complete' : 'Importing Playlists'}
        </DialogTitle>
        <DialogDescription>
          {isComplete
            ? `${job.completedPlaylists}/${job.totalPlaylists} playlists processed.`
            : `${job.completedPlaylists}/${job.totalPlaylists} playlists completed...`}
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-72 overflow-auto rounded-md border border-input my-4">
        {playlists.map((entry) => (
          <ImportPlaylistProgressRow key={entry.id} entry={entry} />
        ))}
      </div>

      {isComplete && (
        <div className="text-sm text-muted-foreground px-1 mb-4">
          {doneCount > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {doneCount} imported successfully
            </span>
          )}
          {partialCount > 0 && (
            <>
              {doneCount > 0 && ', '}
              <span className="text-yellow-600 dark:text-yellow-400">
                {partialCount} partially imported
              </span>
            </>
          )}
          {failedCount > 0 && (
            <>
              {(doneCount > 0 || partialCount > 0) && ', '}
              <span className="text-destructive">
                {failedCount} failed
              </span>
            </>
          )}
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          onClick={() => useImportDialogStore.getState().close()}
        >
          {isComplete ? 'Close' : 'Close (import continues in background)'}
        </Button>
      </DialogFooter>
    </>
  );
}

function ProgressView({ jobId }: { jobId: string }) {
  const { data, isLoading } = useImportJob(jobId);

  if (isLoading || !data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-5 w-5" />
            Importing Playlists
          </DialogTitle>
          <DialogDescription>
            Starting import...
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return <ProgressViewContent data={data} />;
}

export function ImportPlaylistsDialog() {
  const { isOpen, activeJobId, targetProvider } = useImportDialogStore();
  const close = useImportDialogStore((s) => s.close);
  const startImport = useStartImport();

  const handleStartImport = useCallback(
    (sourceProvider: string, playlists: Array<{ id: string; name: string }>) => {
      if (!targetProvider) return;
      startImport.mutate({
        sourceProvider,
        targetProvider,
        playlists,
      });
    },
    [targetProvider, startImport],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-[520px]">
        {activeJobId ? (
          <ProgressView jobId={activeJobId} />
        ) : targetProvider ? (
          <SelectionView
            targetProvider={targetProvider}
            onStartImport={handleStartImport}
            isPending={startImport.isPending}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
