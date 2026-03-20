import {
  createProviderAuthState,
  type ProviderAuthState,
  type ProviderAuthSummary,
  type ProviderId,
} from '@/lib/providers/types';
import type { ProviderAuthError } from '@/lib/providers/errors';

type ProviderAuthListener = () => void;

/**
 * Public contract:
 * - state updates are ignored when the full state is equal (`areStatesEqual`)
 * - `summary.anyAuthenticated` is derived from provider codes (`ok`)
 * - `setFromAuthError` writes provider code transitions from transport/auth errors
 * - `hydrateFromServer` replaces both provider states in one atomic update
 */
function areStatesEqual(a: ProviderAuthState, b: ProviderAuthState): boolean {
  return (
    a.provider === b.provider
    && a.code === b.code
    && a.canAttemptRefresh === b.canAttemptRefresh
    && a.updatedAt === b.updatedAt
  );
}

function withDerivedSummary(stateByProvider: Record<ProviderId, ProviderAuthState>): ProviderAuthSummary {
  return {
    spotify: stateByProvider.spotify,
    tidal: stateByProvider.tidal,
    anyAuthenticated: stateByProvider.spotify.code === 'ok' || stateByProvider.tidal.code === 'ok',
  };
}

export class ProviderAuthRegistry {
  private stateByProvider: Record<ProviderId, ProviderAuthState> = {
    spotify: createProviderAuthState('spotify'),
    tidal: createProviderAuthState('tidal'),
  };

  private summary: ProviderAuthSummary = withDerivedSummary(this.stateByProvider);

  private listeners = new Set<ProviderAuthListener>();

  private hydratedFromServer = false;

  getState(provider: ProviderId): ProviderAuthState {
    return this.stateByProvider[provider];
  }

  getSummary(): ProviderAuthSummary {
    return this.summary;
  }

  hasHydratedFromServer(): boolean {
    return this.hydratedFromServer;
  }

  setState(next: ProviderAuthState): void {
    const previous = this.stateByProvider[next.provider];
    if (areStatesEqual(previous, next)) {
      return;
    }

    this.stateByProvider = {
      ...this.stateByProvider,
      [next.provider]: next,
    };
    this.summary = withDerivedSummary(this.stateByProvider);

    this.emitChange();
  }

  setFromAuthError(error: ProviderAuthError): void {
    this.setState({
      provider: error.provider,
      code: error.code,
      canAttemptRefresh: error.code === 'expired' || error.code === 'invalid',
      updatedAt: Date.now(),
    });
  }

  hydrateFromServer(summary: ProviderAuthSummary): void {
    this.stateByProvider = {
      spotify: summary.spotify,
      tidal: summary.tidal,
    };
    this.summary = withDerivedSummary(this.stateByProvider);
    this.hydratedFromServer = true;
    this.emitChange();
  }

  markHydrated(): void {
    if (this.hydratedFromServer) {
      return;
    }

    this.hydratedFromServer = true;
    this.emitChange();
  }

  onChange(listener: ProviderAuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    const now = Date.now();
    this.stateByProvider = {
      spotify: createProviderAuthState('spotify', 'unauthenticated', false, now),
      tidal: createProviderAuthState('tidal', 'unauthenticated', false, now),
    };
    this.summary = withDerivedSummary(this.stateByProvider);
    this.hydratedFromServer = false;
    this.emitChange();
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const providerAuthRegistry = new ProviderAuthRegistry();
