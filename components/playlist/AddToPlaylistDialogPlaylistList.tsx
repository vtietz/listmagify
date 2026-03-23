'use client';

import { Check, Plus, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { PlayingIndicator } from '@/components/ui/playing-indicator';
import { cn } from '@/lib/utils';
import type { Playlist } from '@/lib/music-provider/types';
import { ArtworkImage } from '@/components/shared/ArtworkImage';

type PlaylistListItem = Playlist | { kind: 'separator' };

interface PlaylistRenderContext {
  playlistsWithTrack: Set<string>;
  processingPlaylists: Set<string>;
  checkingPlaylists: Set<string>;
  currentPlaybackPlaylistId: string | null;
  userId: string | undefined;
  isPlaylistStatusKnown: (playlistId: string) => boolean;
  registerPlaylistElement: (playlistId: string, element: HTMLElement | null) => void;
  handleToggleTrack: (playlist: Playlist, containsTrack: boolean) => void;
}

interface PlaylistRowState {
  containsTrack: boolean;
  isProcessing: boolean;
  isChecking: boolean;
  statusKnown: boolean;
  isEditable: boolean;
}

function isSeparatorItem(item: PlaylistListItem): item is { kind: 'separator' } {
  return 'kind' in item && item.kind === 'separator';
}

function getPlaylistRowState(playlist: Playlist, context: PlaylistRenderContext): PlaylistRowState {
  return {
    containsTrack: context.playlistsWithTrack.has(playlist.id),
    isProcessing: context.processingPlaylists.has(playlist.id),
    isChecking: context.checkingPlaylists.has(playlist.id),
    statusKnown: context.isPlaylistStatusKnown(playlist.id),
    isEditable: Boolean(context.userId && playlist.owner?.id === context.userId),
  };
}

function canInteractWithPlaylist(state: PlaylistRowState): boolean {
  return state.isEditable && !state.isProcessing && !state.isChecking && state.statusKnown;
}

function PlaylistCover({ playlist }: { playlist: Playlist }) {
  if (playlist.image?.url) {
    return (
      // Parent container must have position:relative for fill to work
      <ArtworkImage
        src={playlist.image.url}
        alt={playlist.name}
        fill
        className="object-cover"
        sizes="48px"
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
      No cover
    </div>
  );
}

function PlaylistActionIcon({ state }: { state: PlaylistRowState }) {
  if (state.isProcessing || state.isChecking) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground flex-shrink-0" />;
  }

  if (!state.statusKnown) {
    return (
      <div className="h-6 w-6 flex items-center justify-center text-muted-foreground/50 flex-shrink-0">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (state.containsTrack) {
    return (
      <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <Check className="h-4 w-4 text-white" />
      </div>
    );
  }

  return (
    <div className="h-6 w-6 flex items-center justify-center text-muted-foreground flex-shrink-0">
      <Plus className="h-5 w-5" />
    </div>
  );
}

function renderPlaylistItem(
  item: PlaylistListItem,
  index: number,
  context: PlaylistRenderContext,
): React.ReactNode {
  if (isSeparatorItem(item)) {
    return (
      <div key={`separator-${index}`} className="py-2">
        <Separator />
      </div>
    );
  }

  const playlist = item;
  const state = getPlaylistRowState(playlist, context);
  const interactive = canInteractWithPlaylist(state);

  return (
    <button
      key={playlist.id}
      ref={(el) => context.registerPlaylistElement(playlist.id, el)}
      data-playlist-id={playlist.id}
      onClick={(e) => {
        e.stopPropagation();
        if (interactive) {
          context.handleToggleTrack(playlist, state.containsTrack);
        }
      }}
      disabled={!interactive}
      className={cn(
        'w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors',
        interactive && 'hover:bg-muted',
        !interactive && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="relative w-12 h-12 rounded bg-muted flex-shrink-0 overflow-hidden">
        <PlaylistCover playlist={playlist} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {context.currentPlaybackPlaylistId === playlist.id && (
            <PlayingIndicator size="sm" />
          )}
          <div className="font-medium truncate">{playlist.name}</div>
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {playlist.ownerName || 'Unknown'}
        </div>
      </div>

      <PlaylistActionIcon state={state} />
    </button>
  );
}

interface AddToPlaylistDialogPlaylistListProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  allPlaylistsCount: number;
  filteredPlaylists: PlaylistListItem[];
  playlistsWithTrack: Set<string>;
  processingPlaylists: Set<string>;
  checkingPlaylists: Set<string>;
  currentPlaybackPlaylistId: string | null;
  userId: string | undefined;
  isPlaylistStatusKnown: (playlistId: string) => boolean;
  registerPlaylistElement: (playlistId: string, element: HTMLElement | null) => void;
  handleToggleTrack: (playlist: Playlist, containsTrack: boolean) => void;
  isFetchingNextPage: boolean;
}

export function AddToPlaylistDialogPlaylistList({
  scrollContainerRef,
  isLoading,
  allPlaylistsCount,
  filteredPlaylists,
  playlistsWithTrack,
  processingPlaylists,
  checkingPlaylists,
  currentPlaybackPlaylistId,
  userId,
  isPlaylistStatusKnown,
  registerPlaylistElement,
  handleToggleTrack,
  isFetchingNextPage,
}: AddToPlaylistDialogPlaylistListProps) {
  const renderContext: PlaylistRenderContext = {
    playlistsWithTrack,
    processingPlaylists,
    checkingPlaylists,
    currentPlaybackPlaylistId,
    userId,
    isPlaylistStatusKnown,
    registerPlaylistElement,
    handleToggleTrack,
  };

  return (
    <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto space-y-1">
      {isLoading && allPlaylistsCount === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading playlists...
        </div>
      ) : filteredPlaylists.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No playlists found
        </div>
      ) : (
        filteredPlaylists.map((item, index) => renderPlaylistItem(item, index, renderContext))
      )}

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading more...
        </div>
      )}
    </div>
  );
}
