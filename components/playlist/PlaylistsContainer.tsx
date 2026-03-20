"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { PlaylistsToolbar } from "@/components/playlist/PlaylistsToolbar";
import { PlaylistsGrid } from "@/components/playlist/PlaylistsGrid";
import { InlineSignInCard } from '@/components/auth/InlineSignInCard';
import { useProviderAuth } from '@/hooks/auth/useAuth';
import { useEnsureValidToken } from '@/hooks/auth/useEnsureValidToken';

function parseProviderFromQuery(value: string | null | undefined): MusicProviderId {
  if (value === 'spotify' || value === 'tidal') {
    return value;
  }

  throw new Error(`Unsupported provider: ${value}`);
}

export interface PlaylistsContainerProps {
  initialItems: Playlist[];
  initialNextCursor: string | null;
  providerId: MusicProviderId;
  availableProviders: MusicProviderId[];
}

/**
 * Container component managing state for playlists index.
 * Coordinates between toolbar (search/refresh) and grid (display/infinite scroll).
 */
export function PlaylistsContainer({
  initialItems,
  initialNextCursor,
  providerId,
  availableProviders,
}: PlaylistsContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const providerFromQuery = searchParams?.get('provider') ?? null;
  let activeProviderId: MusicProviderId = providerId;
  try {
    const parsed = parseProviderFromQuery(providerFromQuery);
    activeProviderId = availableProviders.includes(parsed) ? parsed : providerId;
  } catch {
    activeProviderId = providerId;
  }

  const providerAuth = useProviderAuth(activeProviderId);

  useEnsureValidToken(activeProviderId, {
    enabled: providerAuth.code === 'expired' || providerAuth.code === 'invalid',
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newlyCreatedPlaylist, setNewlyCreatedPlaylist] = useState<Playlist | null>(null);

  const isProviderConnected = providerAuth.code === 'ok';
  const shouldShowProviderCta = providerAuth.code === 'unauthenticated' || providerAuth.code === 'expired' || providerAuth.code === 'invalid';

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
  }, []);

  const handleProviderChange = useCallback((nextProviderId: MusicProviderId) => {
    if (nextProviderId === activeProviderId) {
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('provider', nextProviderId);
    const query = params.toString();
    router.push(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [activeProviderId, pathname, router, searchParams]);

  const handleRefreshComplete = useCallback(() => {
    setIsRefreshing(false);
  }, []);

  // Called when a new playlist is created - store it for immediate display
  const handlePlaylistCreated = useCallback((playlist: Playlist) => {
    setNewlyCreatedPlaylist(playlist);
  }, []);

  // Called when grid has incorporated the new playlist
  const handleNewPlaylistAdded = useCallback(() => {
    setNewlyCreatedPlaylist(null);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 mt-6">
      <div className="flex-shrink-0">
        <PlaylistsToolbar
          providerId={activeProviderId}
          availableProviders={availableProviders}
          onProviderChange={handleProviderChange}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          onPlaylistCreated={handlePlaylistCreated}
          disableActions={!isProviderConnected}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {shouldShowProviderCta ? (
          <InlineSignInCard provider={activeProviderId} reason={providerAuth.code} />
        ) : (
          <PlaylistsGrid
            providerId={activeProviderId}
            initialItems={initialItems}
            initialNextCursor={initialNextCursor}
            searchTerm={searchTerm}
            isRefreshing={isRefreshing}
            onRefreshComplete={handleRefreshComplete}
            newlyCreatedPlaylist={newlyCreatedPlaylist}
            onNewPlaylistAdded={handleNewPlaylistAdded}
          />
        )}
      </div>
    </div>
  );
}
