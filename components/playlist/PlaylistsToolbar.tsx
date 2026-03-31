"use client";

import { AdaptiveSearch } from "@/components/ui/adaptive-search";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, Import } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { PlaylistDialog } from "@/components/playlist/PlaylistDialog";
import { useCreatePlaylist } from "@/lib/spotify/playlistMutations";
import { ProviderStatusDropdown } from '@/components/auth/ProviderStatusDropdown';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import { ImportPlaylistsDialog } from "@/features/import/ui/ImportPlaylistsDialog";
import { useImportDialogStore } from "@/features/import/stores/useImportDialogStore";
import { useSyncSchedulerEnabled } from '@shared/hooks/useAppConfig';
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

export interface PlaylistsToolbarProps {
  providerId: MusicProviderId;
  availableProviders: MusicProviderId[];
  onProviderChange: (providerId: MusicProviderId) => void;
  searchTerm: string;
  onSearchChange: (query: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onPlaylistCreated?: (playlist: Playlist) => void;
  disableActions?: boolean;
}

const providerDisplayNames: Record<MusicProviderId, string> = {
  spotify: 'Spotify',
  tidal: 'TIDAL',
};

function deriveProviderStatus(code: string): 'connected' | 'disconnected' {
  return code === 'ok' ? 'connected' : 'disconnected';
}

function getRefreshTitle(isRefreshing: boolean, providerId: MusicProviderId): string {
  if (isRefreshing) {
    return "Refreshing...";
  }

  return `Refresh playlists from ${providerDisplayNames[providerId]}`;
}

function getRefreshAriaLabel(isRefreshing: boolean): string {
  return isRefreshing ? "Refreshing playlists" : "Refresh playlists";
}

function useShowImportButton(
  summary: ReturnType<typeof useAuthSummary>,
  syncSchedulerEnabled: boolean,
): boolean {
  const connectedCount = [summary.spotify, summary.tidal].filter(s => s.code === 'ok').length;

  return syncSchedulerEnabled && connectedCount >= 2;
}

/**
 * Toolbar for playlists index with debounced search, refresh, and create playlist button.
 */
export function PlaylistsToolbar({
  providerId,
  availableProviders,
  onProviderChange,
  searchTerm,
  onSearchChange,
  isRefreshing,
  onRefresh,
  onPlaylistCreated,
  disableActions = false,
}: PlaylistsToolbarProps) {
  const [inputValue, setInputValue] = useState(searchTerm);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const summary = useAuthSummary();

  const statusMap = {
    spotify: deriveProviderStatus(summary.spotify.code),
    tidal: deriveProviderStatus(summary.tidal.code),
  } as const;

  const createPlaylist = useCreatePlaylist();
  const openImportDialog = useImportDialogStore((s) => s.open);
  const syncSchedulerEnabled = useSyncSchedulerEnabled();
  const showImport = useShowImportButton(summary, syncSchedulerEnabled);
  const actionsDisabled = isRefreshing || disableActions;

  // Sync with external searchTerm changes
  useEffect(() => {
    setInputValue(searchTerm);
  }, [searchTerm]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, onSearchChange]);

  const handleRefresh = useCallback(() => {
    if (!isRefreshing) {
      onRefresh();
    }
  }, [onRefresh, isRefreshing]);

  const handleCreatePlaylist = useCallback(async (values: { name: string; description: string; isPublic: boolean }) => {
    const result = await createPlaylist.mutateAsync({
      providerId,
      name: values.name,
      description: values.description,
      isPublic: values.isPublic,
    });

    onPlaylistCreated?.({
      id: result.id,
      name: result.name,
      description: result.description,
      isPublic: result.isPublic,
      ownerName: result.ownerName,
      image: result.image,
      tracksTotal: result.tracksTotal,
    });
  }, [createPlaylist, onPlaylistCreated, providerId]);

  return (
    <div className="flex items-center gap-3">
      <ProviderStatusDropdown
        context="panel"
        currentProviderId={providerId}
        providers={availableProviders}
        statusMap={statusMap}
        hideWhenSingleConnected={true}
        showProviderLabelInPanelTrigger={true}
        onProviderChange={onProviderChange}
        data-testid="playlists-provider-status-dropdown"
      />

      <AdaptiveSearch
        value={inputValue}
        onChange={setInputValue}
        placeholder="Search playlists..."
        disabled={actionsDisabled}
        ariaLabel="Search playlists"
        breakpoint={200}
      />

      <Button
        variant="default"
        size="sm"
        onClick={() => setCreateDialogOpen(true)}
        disabled={actionsDisabled}
        title="Create new playlist"
        aria-label="Create new playlist"
        className="shrink-0"
      >
        <Plus className="h-4 w-4 mr-1" />
        New Playlist
      </Button>

      {showImport && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openImportDialog(providerId)}
          disabled={actionsDisabled}
          title="Import playlists from another provider"
          aria-label="Import playlists"
          className="shrink-0"
        >
          <Import className="h-4 w-4 mr-1" />
          Import
        </Button>
      )}

      <Button
        variant="outline"
        size="icon"
        onClick={handleRefresh}
        disabled={actionsDisabled}
        title={getRefreshTitle(isRefreshing, providerId)}
        aria-label={getRefreshAriaLabel(isRefreshing)}
        className="shrink-0"
      >
        <RefreshCw
          className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
      </Button>

      <PlaylistDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        mode="create"
        onSubmit={handleCreatePlaylist}
        isSubmitting={createPlaylist.isPending}
      />

      <ImportPlaylistsDialog />
    </div>
  );
}
