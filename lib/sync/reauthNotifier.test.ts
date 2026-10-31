import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sendReauthRequiredEmail = vi.fn<(params: { email: string; providerName: string; appUrl: string }) => Promise<boolean>>();

vi.mock('@/lib/email/reauth-emails', () => ({
  sendReauthRequiredEmail: (params: { email: string; providerName: string; appUrl: string }) =>
    sendReauthRequiredEmail(params),
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { NEXTAUTH_URL: 'https://listmagify.test' },
}));

type TokenStore = typeof import('@/lib/auth/tokenStore');
type NotificationStore = typeof import('@/lib/auth/tokenNotificationStore');
type Notifier = typeof import('@/lib/sync/reauthNotifier');

let tokenStore: TokenStore;
let notificationStore: NotificationStore;
let notifier: Notifier;
let closeAuthDb: () => void;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'auth-reauth-'));
  vi.stubEnv('AUTH_DB_PATH', join(dir, 'auth.db'));
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'test-encryption-key');
  vi.resetModules();
  tokenStore = await import('@/lib/auth/tokenStore');
  notificationStore = await import('@/lib/auth/tokenNotificationStore');
  notifier = await import('@/lib/sync/reauthNotifier');
  ({ closeAuthDb } = await import('@/lib/auth/tokenDb'));
});

afterAll(() => {
  closeAuthDb();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  sendReauthRequiredEmail.mockReset();
  sendReauthRequiredEmail.mockResolvedValue(true);
});

function signIn(userId: string, email?: string) {
  tokenStore.persistProviderTokens({
    userId,
    provider: 'tidal',
    accessToken: 'access',
    refreshToken: 'refresh',
    accessTokenExpires: Date.now() + 3_600_000,
  });
  if (email) {
    notificationStore.setProviderAccountEmail(userId, 'tidal', email);
  }
}

describe('notifyReauthRequired', () => {
  it('sends exactly one email per expired authorization', async () => {
    signIn('tidal:1', 'one@example.com');
    tokenStore.markTokenStatus('tidal:1', 'tidal', 'needs_reauth');

    await Promise.all([
      notifier.notifyReauthRequired('tidal:1', 'tidal'),
      notifier.notifyReauthRequired('tidal:1', 'tidal'),
    ]);
    await notifier.notifyReauthRequired('tidal:1', 'tidal');

    expect(sendReauthRequiredEmail).toHaveBeenCalledTimes(1);
    expect(sendReauthRequiredEmail).toHaveBeenCalledWith({
      email: 'one@example.com',
      providerName: 'TIDAL',
      appUrl: 'https://listmagify.test',
    });
  });

  it('notifies again after the user signed in and the token expired once more', async () => {
    signIn('tidal:2', 'two@example.com');
    tokenStore.markTokenStatus('tidal:2', 'tidal', 'revoked');
    await notifier.notifyReauthRequired('tidal:2', 'tidal');

    signIn('tidal:2');
    tokenStore.markTokenStatus('tidal:2', 'tidal', 'needs_reauth');
    await notifier.notifyReauthRequired('tidal:2', 'tidal');

    expect(sendReauthRequiredEmail).toHaveBeenCalledTimes(2);
  });

  it('does not send while the token is still active', async () => {
    signIn('tidal:3', 'three@example.com');

    await notifier.notifyReauthRequired('tidal:3', 'tidal');

    expect(sendReauthRequiredEmail).not.toHaveBeenCalled();
  });

  it('does not send without a stored email', async () => {
    signIn('tidal:4');
    tokenStore.markTokenStatus('tidal:4', 'tidal', 'needs_reauth');

    await notifier.notifyReauthRequired('tidal:4', 'tidal');

    expect(sendReauthRequiredEmail).not.toHaveBeenCalled();
  });

  it('retries on a later run when sending failed', async () => {
    signIn('tidal:5', 'five@example.com');
    tokenStore.markTokenStatus('tidal:5', 'tidal', 'needs_reauth');
    sendReauthRequiredEmail.mockRejectedValueOnce(new Error('smtp down'));

    await notifier.notifyReauthRequired('tidal:5', 'tidal');
    await notifier.notifyReauthRequired('tidal:5', 'tidal');
    await notifier.notifyReauthRequired('tidal:5', 'tidal');

    expect(sendReauthRequiredEmail).toHaveBeenCalledTimes(2);
  });

  it('keeps the sign-in email when the BYOK backfill runs', () => {
    signIn('tidal:6', 'signin@example.com');
    notificationStore.setProviderAccountEmailIfMissing('tidal:6', 'tidal', 'other@example.com');
    tokenStore.markTokenStatus('tidal:6', 'tidal', 'needs_reauth');

    expect(notificationStore.claimReauthNotification('tidal:6', 'tidal')).toBe('signin@example.com');
  });
});
