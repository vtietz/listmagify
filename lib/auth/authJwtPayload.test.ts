import { describe, expect, it } from 'vitest';
import { buildJwtCallbackResult, migrateLegacyProviderTokens } from '@/lib/auth/authJwtPayload';

describe('migrateLegacyProviderTokens', () => {
  it('lifts a pre-multi-provider token into musicProviderTokens.spotify', () => {
    const legacy = {
      sub: 'simsonoo',
      accessToken: 'access',
      refreshToken: 'refresh',
      accessTokenExpires: 1_800_000_000_000,
      isByok: true,
      byok: { clientId: 'id', clientSecret: 'secret' },
    };

    expect(migrateLegacyProviderTokens(legacy)).toEqual({
      spotify: {
        accessToken: 'access',
        refreshToken: 'refresh',
        accessTokenExpires: 1_800_000_000_000,
        isByok: true,
        byok: { clientId: 'id', clientSecret: 'secret' },
      },
    });
  });

  it('keeps the migrated token after the JWT payload is stripped', () => {
    const legacy = { sub: 'simsonoo', accessToken: 'access', refreshToken: 'refresh' };
    const result = buildJwtCallbackResult(legacy, migrateLegacyProviderTokens(legacy), {});

    expect(result.accessToken).toBeUndefined();
    expect(result.musicProviderTokens?.spotify?.refreshToken).toBe('refresh');
  });

  it('leaves current-format tokens untouched', () => {
    const token = {
      accessToken: 'stale-top-level',
      musicProviderTokens: { tidal: { accessToken: 'tidal-access' } },
    };

    expect(migrateLegacyProviderTokens(token)).toEqual({ tidal: { accessToken: 'tidal-access' } });
  });

  it('returns an empty store when there is nothing to migrate', () => {
    expect(migrateLegacyProviderTokens({ sub: 'user' })).toEqual({});
  });
});
