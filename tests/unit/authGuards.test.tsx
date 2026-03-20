import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProviderPanelGuard } from '@/components/auth/ProviderPanelGuard';
import { AnyAuthGuard } from '@/components/auth/AnyAuthGuard';
import { useProviderAuth, useAuthRegistryHydrated, useAuthSummary } from '@/hooks/auth/useAuth';
import { useEnsureValidToken } from '@/hooks/auth/useEnsureValidToken';
import { isPerPanelInlineLoginEnabled } from '@/lib/utils';

vi.mock('next/navigation', () => ({
  usePathname: () => '/split-editor',
  useSearchParams: () => new URLSearchParams('provider=spotify'),
}));

vi.mock('@/components/auth/SignInButton', () => ({
  SignInButton: ({ label }: { label?: string }) => <button>{label ?? 'Sign in'}</button>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useProviderAuth: vi.fn(),
  useAuthSummary: vi.fn(),
  useAuthRegistryHydrated: vi.fn(),
}));

vi.mock('@/hooks/auth/useEnsureValidToken', () => ({
  useEnsureValidToken: vi.fn(),
}));

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return {
    ...actual,
    isPerPanelInlineLoginEnabled: vi.fn(),
  };
});

describe('Auth guards', () => {
  beforeEach(() => {
    vi.mocked(isPerPanelInlineLoginEnabled).mockReturnValue(true);
    vi.mocked(useEnsureValidToken).mockReturnValue({ ensuring: false });
    vi.mocked(useProviderAuth).mockReturnValue({
      provider: 'spotify',
      code: 'ok',
      canAttemptRefresh: true,
      updatedAt: 1,
    });
    vi.mocked(useAuthRegistryHydrated).mockReturnValue(true);
    vi.mocked(useAuthSummary).mockReturnValue({
      spotify: {
        provider: 'spotify',
        code: 'ok',
        canAttemptRefresh: true,
        updatedAt: 1,
      },
      tidal: {
        provider: 'tidal',
        code: 'unauthenticated',
        canAttemptRefresh: false,
        updatedAt: 1,
      },
      anyAuthenticated: true,
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ availableProviders: ['spotify', 'tidal'] }),
    }));
  });

  it('ProviderPanelGuard renders children when provider auth is ok', () => {
    render(
      <ProviderPanelGuard provider="spotify">
        <div>panel-content</div>
      </ProviderPanelGuard>,
    );

    expect(screen.getByText('panel-content')).toBeInTheDocument();
  });

  it('ProviderPanelGuard renders overlay sign-in for expired provider while keeping panel content mounted', () => {
    vi.mocked(useProviderAuth).mockReturnValue({
      provider: 'spotify',
      code: 'expired',
      canAttemptRefresh: true,
      updatedAt: 2,
    });

    render(
      <ProviderPanelGuard provider="spotify">
        <div>panel-content</div>
      </ProviderPanelGuard>,
    );

    expect(screen.getByText('Spotify sign-in required')).toBeInTheDocument();
    expect(screen.getByTestId('panel-auth-overlay')).toBeInTheDocument();
    const panelContent = screen.getByText('panel-content');
    expect(panelContent).toBeInTheDocument();
    expect(panelContent.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('AnyAuthGuard renders global fallback when no provider is authenticated', async () => {
    vi.mocked(useAuthSummary).mockReturnValue({
      spotify: {
        provider: 'spotify',
        code: 'unauthenticated',
        canAttemptRefresh: false,
        updatedAt: 1,
      },
      tidal: {
        provider: 'tidal',
        code: 'unauthenticated',
        canAttemptRefresh: false,
        updatedAt: 1,
      },
      anyAuthenticated: false,
    });

    render(
      <AnyAuthGuard>
        <div>app-content</div>
      </AnyAuthGuard>,
    );

    await waitFor(() => {
      expect(screen.getByText('Session expired')).toBeInTheDocument();
    });
    expect(screen.queryByText('app-content')).not.toBeInTheDocument();
  });
});
