"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Playlist } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { PlaylistsToolbar } from "@/components/playlist/PlaylistsToolbar";
import { PlaylistsGrid } from "@/components/playlist/PlaylistsGrid";
import { InlineSignInCard } from '@/components/auth/InlineSignInCard';
import { useAuthRegistryHydrated, useProviderAuth } from '@features/auth/hooks/useAuth';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import { useEnsureValidToken } from '@features/auth/hooks/useEnsureValidToken';
import { useImportDialogStore } from '@/features/import/stores/useImportDialogStore';

export type PlaylistsInitialLoadError = {
  kind: 'rate_limited' | 'provider_error';
  message: string;
  retryAfterSeconds?: number;
};

function parseProviderFromQuery(value: string | null | undefined): MusicProviderId {
  if (value === 'spotify' || value === 'tidal') {
    return value;
  }

  throw new Error(`Unsupported provider: ${value}`);
}

export interface PlaylistsContainerProps {
  initialItems: Playlist[];
  initialNextCursor: string | null;
  initialLoadError?: PlaylistsInitialLoadError | null;
  providerId: MusicProviderId;
  availableProviders: MusicProviderId[];
}

type PlaylistsAreaError = PlaylistsInitialLoadError | {
  kind: 'rate_limited';
  message: string;
  retryAfterSeconds?: number;
};

function formatRetryWindow(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) {
    return 'Try again shortly.';
  }

  return `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
}

/**
 * Container component managing state for playlists index.
 * Coordinates between toolbar (search/refresh) and grid (display/infinite scroll).
 */
export function PlaylistsContainer({
  initialItems,
  initialNextCursor,
  initialLoadError = null,
  providerId,
  availableProviders,
}: PlaylistsContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authSummary = useAuthSummary();

  const providerFromQuery = searchParams?.get('provider') ?? null;
  const queryProviderId = useMemo(() => {
    try {
      const parsed = parseProviderFromQuery(providerFromQuery);
      return availableProviders.includes(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [availableProviders, providerFromQuery]);

  const connectedProviders = useMemo(() => {
    return availableProviders.filter((candidate) => authSummary[candidate].code === 'ok');
  }, [authSummary, availableProviders]);

  const activeProviderId: MusicProviderId = useMemo(() => {
    const preferred = queryProviderId ?? providerId;

    if (connectedProviders.length === 0) {
      return preferred;
    }

    if (connectedProviders.includes(preferred)) {
      return preferred;
    }

    return connectedProviders[0]!;
  }, [connectedProviders, providerId, queryProviderId]);

  const providerAuth = useProviderAuth(activeProviderId);

  useEnsureValidToken(activeProviderId, {
    enabled: providerAuth.code === 'expired' || providerAuth.code === 'invalid',
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newlyCreatedPlaylist, setNewlyCreatedPlaylist] = useState<Playlist | null>(null);
  const [playlistsAreaError, setPlaylistsAreaError] = useState<PlaylistsAreaError | null>(initialLoadError);

  const hydrated = useAuthRegistryHydrated();
  const isProviderConnected = providerAuth.code === 'ok';
  const noProvidersConnected = hydrated && connectedProviders.length === 0;
  const shouldShowProviderCta = !noProvidersConnected && hydrated && (providerAuth.code === 'unauthenticated' || providerAuth.code === 'expired' || providerAuth.code === 'invalid');

  // Redirect to landing page when all providers are disconnected
  useEffect(() => {
    if (noProvidersConnected) {
      router.replace('/');
    }
  }, [noProvidersConnected, router]);

  // Trigger a data refresh when the active provider changes (e.g. after logout fallback)
  const prevProviderRef = useRef(activeProviderId);
  useEffect(() => {
    if (prevProviderRef.current !== activeProviderId) {
      prevProviderRef.current = activeProviderId;
      setIsRefreshing(true);
    }
  }, [activeProviderId]);

  const handleRefresh = useCallback(() => {
    setPlaylistsAreaError(null);
    setIsRefreshing(true);
  }, []);

  const handleProviderChange = useCallback((nextProviderId: MusicProviderId) => {
    if (nextProviderId === activeProviderId) {
      return;
    }

    setPlaylistsAreaError(null);

    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('provider', nextProviderId);
    const query = params.toString();
    router.push(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [activeProviderId, pathname, router, searchParams]);

  useEffect(() => {
    if (providerFromQuery === activeProviderId) {
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('provider', activeProviderId);
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [activeProviderId, pathname, providerFromQuery, router, searchParams]);

  const handleRefreshComplete = useCallback(() => {
    setIsRefreshing(false);
  }, []);

  const handleGridError = useCallback((error: { kind: 'rate_limited'; message: string; retryAfterSeconds?: number }) => {
    setPlaylistsAreaError(error);
  }, []);

  const shouldShowPlaylistsAreaError = playlistsAreaError !== null && !shouldShowProviderCta;

  // Refresh the grid when the import dialog closes after a completed job
  const importDialogOpen = useImportDialogStore((s) => s.isOpen);
  const prevImportOpenRef = useRef(false);
  useEffect(() => {
    if (prevImportOpenRef.current && !importDialogOpen) {
      handleRefresh();
    }
    prevImportOpenRef.current = importDialogOpen;
  }, [importDialogOpen, handleRefresh]);

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
        ) : shouldShowPlaylistsAreaError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900 space-y-3">
            <h2 className="text-base font-semibold">{playlistsAreaError.kind === 'rate_limited' ? 'Provider rate limit reached' : 'Could not load playlists'}</h2>
            <p className="text-sm">
              {playlistsAreaError.kind === 'rate_limited'
                ? formatRetryWindow(playlistsAreaError.retryAfterSeconds)
                : 'Switch provider or try again.'}
            </p>
            <p className="text-xs opacity-80">{playlistsAreaError.message}</p>
            <div>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center justify-center rounded-md bg-amber-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-amber-800 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
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
            onLoadError={handleGridError}
          />
        )}
      </div>
    </div>
  );
}
