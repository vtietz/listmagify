import type { MusicProviderId } from '@/lib/music-provider/types';

export type ProviderId = MusicProviderId;

export type ProviderAuthCode =
  | 'ok'
  | 'unauthenticated'
  | 'expired'
  | 'invalid'
  | 'insufficient_scope'
  | 'network'
  | 'rate_limited'
  | 'provider_unavailable';

export interface ProviderAuthState {
  provider: ProviderId;
  code: ProviderAuthCode;
  canAttemptRefresh: boolean;
  updatedAt: number;
}

export interface ProviderAuthSummary {
  spotify: ProviderAuthState;
  tidal: ProviderAuthState;
  anyAuthenticated: boolean;
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'spotify' || value === 'tidal';
}

export function isProviderAuthCode(value: unknown): value is ProviderAuthCode {
  return (
    value === 'ok' ||
    value === 'unauthenticated' ||
    value === 'expired' ||
    value === 'invalid' ||
    value === 'insufficient_scope' ||
    value === 'network' ||
    value === 'rate_limited' ||
    value === 'provider_unavailable'
  );
}

export function createProviderAuthState(
  provider: ProviderId,
  code: ProviderAuthCode = 'unauthenticated',
  canAttemptRefresh = false,
  updatedAt = Date.now(),
): ProviderAuthState {
  return {
    provider,
    code,
    canAttemptRefresh,
    updatedAt,
  };
}

export function createDefaultProviderAuthSummary(updatedAt = Date.now()): ProviderAuthSummary {
  const spotify = createProviderAuthState('spotify', 'unauthenticated', false, updatedAt);
  const tidal = createProviderAuthState('tidal', 'unauthenticated', false, updatedAt);

  return {
    spotify,
    tidal,
    anyAuthenticated: false,
  };
}
