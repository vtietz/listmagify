'use client';

import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImportPlaylistSelectionRow } from '@/features/import/ui/ImportPlaylistStatusRow';
import type { Playlist } from '@/lib/music-provider/types';

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

export function SourcePlaylistPicker({
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
