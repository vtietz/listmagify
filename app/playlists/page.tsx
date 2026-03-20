import { getCurrentUserPlaylists } from "@/lib/spotify/fetchers";
import { PlaylistsContainer } from "@/components/playlist/PlaylistsContainer";
import { parseMusicProviderId } from '@/lib/music-provider';
import { getEnabledMusicProviders, getFallbackMusicProviderId } from '@/lib/music-provider/enabledProviders';
import { ProviderApiError } from '@/lib/music-provider/types';

export const dynamic = "force-dynamic";

function isPlaylistAuthFailure(error: unknown): boolean {
  if (error instanceof ProviderApiError) {
    return error.status === 401;
  }

  if (error instanceof Error) {
    return (
      error.message.includes('401')
      || error.message.includes('token_expired')
      || error.message.includes('RefreshAccessTokenError')
      || error.message.includes('Authentication required')
    );
  }

  return false;
}

/**
 * Playlists index page with SSR initial data and client-side infinite scroll.
 * 
 * Features:
 * - Server-rendered initial playlists for fast loading
 * - Client-side search filtering
 * - Infinite scroll with automatic loading
 * - Refresh button to re-fetch from provider
 * - Authentication handled by middleware (no need for page-level redirects)
 */
export default async function PlaylistsPage({
  searchParams,
}: {
  searchParams?: Promise<{ provider?: string }>;
}) {
  const availableProviders = getEnabledMusicProviders();
  const fallbackProvider = getFallbackMusicProviderId();
  const resolvedSearchParams = await searchParams;
  let providerId: 'spotify' | 'tidal' = fallbackProvider;

  try {
    const parsed = parseMusicProviderId(resolvedSearchParams?.provider);
    providerId = availableProviders.includes(parsed) ? parsed : fallbackProvider;
  } catch {
    providerId = fallbackProvider;
  }

  const page = await getCurrentUserPlaylists(50, undefined, providerId).catch((error) => {
    if (isPlaylistAuthFailure(error)) {
      return {
        items: [],
        nextCursor: null,
        total: 0,
      };
    }

    throw error;
  });

  return (
    <div className="container mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Your Playlists</h1>
        </div>
        <span className="text-sm text-muted-foreground">
          {page.total ?? page.items.length} {page.total === 1 ? "playlist" : "playlists"}
        </span>
      </header>

      <PlaylistsContainer
        initialItems={page.items}
        initialNextCursor={page.nextCursor}
        providerId={providerId}
        availableProviders={availableProviders}
      />
    </div>
  );
}