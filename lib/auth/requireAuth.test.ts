/**
 * Tests for requireAuth server utility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, tryAuth, ServerAuthError } from '@/lib/auth/requireAuth';

// Mock next-auth's getServerSession
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock auth options
vi.mock('@/lib/auth/auth', () => ({
  authOptions: {},
}));

import { getServerSession } from 'next-auth';

const mockGetServerSession = vi.mocked(getServerSession);

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session with access token when authenticated', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Test User', email: 'test@example.com' },
      accessToken: 'valid-token-123',
      accessTokenExpires: Date.now() + 3600000,
    } as any);

    const session = await requireAuth();

    expect(session.accessToken).toBe('valid-token-123');
    expect(session.user?.name).toBe('Test User');
  });

  it('throws ServerAuthError when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow(ServerAuthError);
    await expect(requireAuth()).rejects.toMatchObject({
      reason: 'no_session',
    });
  });

  it('throws ServerAuthError when token refresh failed', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Test User' },
      accessToken: 'old-token',
      error: 'RefreshAccessTokenError',
    } as any);

    await expect(requireAuth()).rejects.toThrow(ServerAuthError);
    await expect(requireAuth()).rejects.toMatchObject({
      reason: 'refresh_failed',
    });
  });

  it('throws ServerAuthError when no access token in session', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Test User' },
      // No accessToken
    } as any);

    await expect(requireAuth()).rejects.toThrow(ServerAuthError);
    await expect(requireAuth()).rejects.toMatchObject({
      reason: 'token_expired',
    });
  });
});

describe('tryAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session when authenticated', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Test User' },
      accessToken: 'valid-token-123',
    } as any);

    const session = await tryAuth();

    expect(session).not.toBeNull();
    expect(session?.accessToken).toBe('valid-token-123');
  });

  it('returns null when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const session = await tryAuth();

    expect(session).toBeNull();
  });

  it('returns null when token refresh failed', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { name: 'Test User' },
      error: 'RefreshAccessTokenError',
    } as any);

    const session = await tryAuth();

    expect(session).toBeNull();
  });
});

describe('ServerAuthError', () => {
  it('has correct name and reason', () => {
    const error = new ServerAuthError('Test message', 'no_session');

    expect(error.name).toBe('ServerAuthError');
    expect(error.reason).toBe('no_session');
    expect(error.message).toBe('Test message');
  });
});
