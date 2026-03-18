import Link from 'next/link';
import { getCurrentUserPlaylists } from "@/lib/spotify/fetchers";
import { PlaylistsContainer } from "@/components/playlist/PlaylistsContainer";
import { parseMusicProviderId } from '@/lib/music-provider';
import { getEnabledMusicProviders, getFallbackMusicProviderId } from '@/lib/music-provider/enabledProviders';

export const dynamic = "force-dynamic";

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

  const page = await getCurrentUserPlaylists(50, undefined, providerId);

  return (
    <div className="container mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Your Playlists</h1>
          {availableProviders.length > 1 && (
            <div className="inline-flex rounded-md border border-border bg-background p-1">
              {availableProviders.map((provider) => {
                const isActive = provider === providerId;
                const label = provider === 'spotify' ? 'Spotify' : 'TIDAL';

                return (
                  <Link
                    key={provider}
                    href={`/playlists?provider=${provider}`}
                    className={[
                      'px-3 py-1 text-sm rounded-sm transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                    prefetch={false}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {page.total ?? page.items.length} {page.total === 1 ? "playlist" : "playlists"}
        </span>
      </header>

      <PlaylistsContainer
        initialItems={page.items}
        initialNextCursor={page.nextCursor}
        providerId={providerId}
      />
    </div>
  );
}