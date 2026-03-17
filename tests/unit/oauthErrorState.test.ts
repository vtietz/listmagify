import { describe, expect, it } from 'vitest';
import { getOAuthErrorState } from '@/components/auth/UnapprovedUserDialog';

describe('getOAuthErrorState', () => {
  it('maps access denied errors to development-mode guidance', () => {
    const result = getOAuthErrorState('AccessDenied');

    expect(result.shouldOpen).toBe(true);
    expect(result.title).toBe('Access Denied');
    expect(result.showDevModeHint).toBe(true);
  });

  it('maps OAuth callback errors to a generic retry message', () => {
    const result = getOAuthErrorState('OAuthCallback');

    expect(result.shouldOpen).toBe(true);
    expect(result.title).toBe('Sign-In Failed');
    expect(result.description).toBe('Spotify sign-in could not be completed. Please try again.');
    expect(result.showDevModeHint).toBe(false);
  });

  it('maps configuration errors to configuration guidance', () => {
    const result = getOAuthErrorState('Configuration');

    expect(result.shouldOpen).toBe(true);
    expect(result.title).toBe('Configuration Error');
    expect(result.showDevModeHint).toBe(false);
  });

  it('does not open dialog for unknown errors', () => {
    const result = getOAuthErrorState('UnknownError');

    expect(result.shouldOpen).toBe(false);
  });
});
