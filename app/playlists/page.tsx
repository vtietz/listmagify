import { getCurrentUserPlaylists } from "@/lib/spotify/fetchers";
import { PlaylistsContainer } from "@/components/playlist/PlaylistsContainer";
import { parseMusicProviderId } from '@/lib/music-provider';

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
  const resolvedSearchParams = await searchParams;
  let providerId: 'spotify' | 'tidal' = 'spotify';

  try {
    providerId = parseMusicProviderId(resolvedSearchParams?.provider);
  } catch {
    providerId = 'spotify';
  }

  const page = await getCurrentUserPlaylists(50, undefined, providerId);

  return (
    <div className="container mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Your Playlists</h1>
        <span className="text-sm text-muted-foreground">
          {page.total ?? page.items.length} {page.total === 1 ? "playlist" : "playlists"}
        </span>
      </header>

      <PlaylistsContainer
        initialItems={page.items}
        initialNextCursor={page.nextCursor}
      />
    </div>
  );
}