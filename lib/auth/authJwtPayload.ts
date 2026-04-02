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
