import type { MusicProviderId } from '@/lib/music-provider/types';

type ProviderJwtToken = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  isByok?: boolean;
  byok?: {
    clientId?: string;
    clientSecret?: string;
  };
  error?: string;
};

type ProviderTokenStore = Partial<Record<MusicProviderId, ProviderJwtToken>>;

type AuthJwtToken = Record<string, any> & {
  musicProviderTokens?: ProviderTokenStore;
  providerErrors?: Partial<Record<MusicProviderId, string | undefined>>;
  providerAccountIds?: Partial<Record<MusicProviderId, string>>;
};

/**
 * Sessions issued before multi-provider support (Spotify-only) kept the token
 * at the top level of the JWT. Lift it into `musicProviderTokens.spotify`
 * before `stripJwtPayloadBloat` drops those fields, so existing users stay
 * connected instead of ending up signed in with no provider.
 */
export function migrateLegacyProviderTokens(token: AuthJwtToken): ProviderTokenStore {
  const store: ProviderTokenStore = { ...(token.musicProviderTokens ?? {}) };
  if (token.musicProviderTokens || typeof token.accessToken !== 'string') {
    return store;
  }

  store.spotify = {
    accessToken: token.accessToken,
    ...(typeof token.refreshToken === 'string' ? { refreshToken: token.refreshToken } : {}),
    ...(typeof token.accessTokenExpires === 'number' ? { accessTokenExpires: token.accessTokenExpires } : {}),
    ...(typeof token.error === 'string' ? { error: token.error } : {}),
    ...(token.isByok ? { isByok: true } : {}),
    ...(token.byok ? { byok: token.byok } : {}),
  };
  return store;
}

export function stripJwtPayloadBloat(nextToken: AuthJwtToken): AuthJwtToken {
  const normalized = { ...nextToken };

  delete normalized.accessToken;
  delete normalized.refreshToken;
  delete normalized.accessTokenExpires;
  delete normalized.error;

  delete normalized.access_token;
  delete normalized.refresh_token;
  delete normalized.expires_at;
  delete normalized.token_type;
  delete normalized.scope;
  delete normalized.id_token;

  return normalized;
}

export function buildJwtCallbackResult(
  nextToken: AuthJwtToken,
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
): AuthJwtToken {
  const baseToken = stripJwtPayloadBloat(nextToken);

  return {
    ...baseToken,
    musicProviderTokens: providerTokens,
    providerErrors,
  };
}
