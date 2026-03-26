import { describe, expect, it } from 'vitest';
import { tokenNeedsRefresh } from '@/lib/auth/tokenManager';

describe('tokenNeedsRefresh', () => {
  const now = 1_000_000;

  it('returns false when expiry is missing', () => {
    expect(tokenNeedsRefresh(undefined, now)).toBe(false);
  });

  it('returns false when token is outside refresh buffer', () => {
    const expiresAt = now + 10 * 60 * 1000;
    expect(tokenNeedsRefresh(expiresAt, now)).toBe(false);
  });

  it('returns true when token is inside refresh buffer', () => {
    const expiresAt = now + 2 * 60 * 1000;
    expect(tokenNeedsRefresh(expiresAt, now)).toBe(true);
  });

  it('returns true when token is already expired', () => {
    const expiresAt = now - 1_000;
    expect(tokenNeedsRefresh(expiresAt, now)).toBe(true);
  });
});
