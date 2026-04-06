import { getCurrentUserPlaylists } from "@/lib/spotify/fetchers";
import { PlaylistsContainer } from "@/components/playlist/PlaylistsContainer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { parseMusicProviderId } from '@/lib/music-provider';
import { getEnabledMusicProviders, getFallbackMusicProviderId } from '@/lib/music-provider/enabledProviders';
import { ProviderApiError } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

export const dynamic = "force-dynamic";

type SessionLike = {
  musicProviderTokens?: Partial<Record<MusicProviderId, { accessToken?: string }>>;
};

type PlaylistsInitialLoadError = {
  kind: 'rate_limited' | 'provider_error';
  message: string;
  retryAfterSeconds?: number;
};

type PlaylistsInitialState = {
  items: Awaited<ReturnType<typeof getCurrentUserPlaylists>>['items'];
  nextCursor: string | null;
  total: number;
  initialLoadError: PlaylistsInitialLoadError | null;
};

function resolvePreferredProviderFromSession(
  sessionLike: SessionLike | null,
  availableProviders: MusicProviderId[],
  fallbackProvider: MusicProviderId,
): MusicProviderId {
  const tidalAccessToken = sessionLike?.musicProviderTokens?.tidal?.accessToken;
  if (tidalAccessToken && availableProviders.includes('tidal')) {
    return 'tidal';
  }

  const spotifyAccessToken = sessionLike?.musicProviderTokens?.spotify?.accessToken;
  if (spotifyAccessToken && availableProviders.includes('spotify')) {
    return 'spotify';
  }

  return fallbackProvider;
}

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

function parseRetryAfterSeconds(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/retry\s+after\s+(\d+)\s+seconds?/i);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1] ?? '', 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

function toInitialLoadError(error: ProviderApiError): PlaylistsInitialLoadError {
  const retryAfterSeconds = parseRetryAfterSeconds(error.message) ?? parseRetryAfterSeconds(error.details);

  if (error.status === 429) {
    return {
      kind: 'rate_limited',
      message: error.message,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }

  return {
    kind: 'provider_error',
    message: error.message,
  };
}

function toUnknownInitialLoadError(error: Error): PlaylistsInitialLoadError | null {
  const lowerMessage = error.message.toLowerCase();
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('retry after')) {
    const retryAfterSeconds = parseRetryAfterSeconds(error.message);

    if (retryAfterSeconds !== undefined) {
      return {
        kind: 'rate_limited',
        message: error.message,
        retryAfterSeconds,
      };
    }

    return {
      kind: 'rate_limited',
      message: error.message,
    };
  }

  return null;
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
  const session = await getServerSession(authOptions);
  const typedSession = session as SessionLike | null;
  const resolvedSearchParams = await searchParams;
  let providerId: MusicProviderId = resolvePreferredProviderFromSession(typedSession, availableProviders, fallbackProvider);

  try {
    const parsed = parseMusicProviderId(resolvedSearchParams?.provider);
    providerId = availableProviders.includes(parsed) ? parsed : fallbackProvider;
  } catch {
    providerId = fallbackProvider;
  }

  const initialState: PlaylistsInitialState = await getCurrentUserPlaylists(50, undefined, providerId)
    .then((page) => ({
      items: page.items,
      nextCursor: page.nextCursor,
      total: page.total ?? page.items.length,
      initialLoadError: null,
    }))
    .catch((error) => {
      if (isPlaylistAuthFailure(error)) {
        return {
          items: [],
          nextCursor: null,
          total: 0,
          initialLoadError: null,
        };
      }

      if (error instanceof ProviderApiError) {
        return {
          items: [],
          nextCursor: null,
          total: 0,
          initialLoadError: toInitialLoadError(error),
        };
      }

      if (error instanceof Error) {
        const unknownInitialLoadError = toUnknownInitialLoadError(error);
        if (unknownInitialLoadError) {
          return {
            items: [],
            nextCursor: null,
            total: 0,
            initialLoadError: unknownInitialLoadError,
          };
        }
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
          {initialState.total ?? initialState.items.length} {initialState.total === 1 ? "playlist" : "playlists"}
        </span>
      </header>

      <PlaylistsContainer
        initialItems={initialState.items}
        initialNextCursor={initialState.nextCursor}
        initialLoadError={initialState.initialLoadError}
        providerId={providerId}
        availableProviders={availableProviders}
      />
    </div>
  );
}