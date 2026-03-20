import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaylistsContainer } from '@/components/playlist/PlaylistsContainer';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => '/playlists',
  useSearchParams: () => new URLSearchParams('provider=spotify'),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useProviderAuth: vi.fn(),
}));

vi.mock('@/hooks/auth/useEnsureValidToken', () => ({
  useEnsureValidToken: vi.fn(),
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

import { useProviderAuth } from '@/hooks/auth/useAuth';
import { useEnsureValidToken } from '@/hooks/auth/useEnsureValidToken';

describe('PlaylistsContainer auth behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls useEnsureValidToken with provider id and enabled=true for expired provider', () => {
    vi.mocked(useProviderAuth).mockReturnValue({
      provider: 'spotify',
      code: 'expired',
      canAttemptRefresh: true,
      updatedAt: Date.now(),
    });
    vi.mocked(useEnsureValidToken).mockReturnValue({ ensuring: false });

    render(
      <PlaylistsContainer
        initialItems={[]}
        initialNextCursor={null}
        providerId="spotify"
        availableProviders={['spotify', 'tidal']}
      />,
    );

    expect(useEnsureValidToken).toHaveBeenCalledWith('spotify', { enabled: true });
    expect(screen.getByTestId('inline-signin-card')).toBeInTheDocument();
  });

  it('renders playlists grid when provider auth is ok', () => {
    vi.mocked(useProviderAuth).mockReturnValue({
      provider: 'spotify',
      code: 'ok',
      canAttemptRefresh: true,
      updatedAt: Date.now(),
    });
    vi.mocked(useEnsureValidToken).mockReturnValue({ ensuring: false });

    render(
      <PlaylistsContainer
        initialItems={[]}
        initialNextCursor={null}
        providerId="spotify"
        availableProviders={['spotify', 'tidal']}
      />,
    );

    expect(useEnsureValidToken).toHaveBeenCalledWith('spotify', { enabled: false });
    expect(screen.getByTestId('playlists-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-signin-card')).not.toBeInTheDocument();
  });
});
