import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaylistsContainer } from '@/components/playlist/PlaylistsContainer';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/playlists',
  useSearchParams: () => new URLSearchParams('provider=spotify'),
}));

vi.mock('@features/auth/hooks/useAuth', () => ({
  useProviderAuth: vi.fn(),
  useAuthSummary: vi.fn(),
  useAuthRegistryHydrated: vi.fn().mockReturnValue(true),
}));

vi.mock('@features/auth/hooks/useEnsureValidToken', () => ({
  useEnsureValidToken: vi.fn().mockReturnValue({ ensuring: false }),
}));

vi.mock('@/components/playlist/PlaylistsToolbar', () => ({
  PlaylistsToolbar: () => <div data-testid="playlists-toolbar" />,
}));

vi.mock('@/components/playlist/PlaylistsGrid', () => ({
  PlaylistsGrid: () => <div data-testid="playlists-grid" />,
}));

vi.mock('@/components/auth/InlineSignInCard', () => ({
  InlineSignInCard: ({ provider, reason }: { provider: string; reason: string }) => (
    <div data-testid="inline-signin-card">{provider}:{reason}</div>
  ),
}));

import { useAuthSummary, useProviderAuth } from '@features/auth/hooks/useAuth';

describe('PlaylistsContainer auth behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows inline sign-in card for expired provider', () => {
    vi.mocked(useAuthSummary).mockReturnValue({
      spotify: { provider: 'spotify', code: 'expired', canAttemptRefresh: true, updatedAt: Date.now() },
      tidal: { provider: 'tidal', code: 'ok', canAttemptRefresh: false, updatedAt: Date.now() },
      anyAuthenticated: true,
    });
    vi.mocked(useProviderAuth).mockReturnValue({
      provider: 'spotify',
      code: 'expired',
      canAttemptRefresh: true,
      updatedAt: Date.now(),
    });

    render(
      <PlaylistsContainer
        initialItems={[]}
        initialNextCursor={null}
        providerId="spotify"
        availableProviders={['spotify', 'tidal']}
      />,
    );

    expect(screen.getByTestId('inline-signin-card')).toBeInTheDocument();
  });

  it('renders playlists grid when provider auth is ok', () => {
    vi.mocked(useAuthSummary).mockReturnValue({
      spotify: { provider: 'spotify', code: 'ok', canAttemptRefresh: true, updatedAt: Date.now() },
      tidal: { provider: 'tidal', code: 'unauthenticated', canAttemptRefresh: false, updatedAt: Date.now() },
      anyAuthenticated: true,
    });
    vi.mocked(useProviderAuth).mockReturnValue({
      provider: 'spotify',
      code: 'ok',
      canAttemptRefresh: true,
      updatedAt: Date.now(),
    });

    render(
      <PlaylistsContainer
        initialItems={[]}
        initialNextCursor={null}
        providerId="spotify"
        availableProviders={['spotify', 'tidal']}
      />,
    );

    expect(screen.getByTestId('playlists-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-signin-card')).not.toBeInTheDocument();
  });

  it('shows a localized playlists error while keeping provider controls available', () => {
    vi.mocked(useAuthSummary).mockReturnValue({
      spotify: { provider: 'spotify', code: 'ok', canAttemptRefresh: true, updatedAt: Date.now() },
      tidal: { provider: 'tidal', code: 'ok', canAttemptRefresh: true, updatedAt: Date.now() },
      anyAuthenticated: true,
    });
    vi.mocked(useProviderAuth).mockReturnValue({
      provider: 'spotify',
      code: 'ok',
      canAttemptRefresh: true,
      updatedAt: Date.now(),
    });

    render(
      <PlaylistsContainer
        initialItems={[]}
        initialNextCursor={null}
        initialLoadError={{
          kind: 'rate_limited',
          message: 'Spotify rate limit exceeded. Retry after 4 seconds.',
          retryAfterSeconds: 4,
        }}
        providerId="spotify"
        availableProviders={['spotify', 'tidal']}
      />,
    );

    expect(screen.getByTestId('playlists-toolbar')).toBeInTheDocument();
    expect(screen.getByText('Provider rate limit reached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByTestId('playlists-grid')).not.toBeInTheDocument();
  });
});
