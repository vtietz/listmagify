import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import { createProviderAuthState } from '@/lib/providers/types';
import { ProviderAuthError } from '@/lib/providers/errors';

describe('ProviderAuthRegistry', () => {
  beforeEach(() => {
    providerAuthRegistry.reset();
  });

  it('tracks state changes and derived anyAuthenticated summary', () => {
    providerAuthRegistry.setState(createProviderAuthState('spotify', 'ok', true, 1));
    const summary = providerAuthRegistry.getSummary();

    expect(summary.spotify.code).toBe('ok');
    expect(summary.tidal.code).toBe('unauthenticated');
    expect(summary.anyAuthenticated).toBe(true);
  });

  it('returns a stable summary snapshot when state does not change', () => {
    const first = providerAuthRegistry.getSummary();
    const second = providerAuthRegistry.getSummary();

    expect(second).toBe(first);

    providerAuthRegistry.setState(createProviderAuthState('spotify', 'ok', true, 5));

    const third = providerAuthRegistry.getSummary();
    expect(third).not.toBe(first);
  });

  it('notifies listeners when state transitions', () => {
    const listener = vi.fn();
    const unsubscribe = providerAuthRegistry.onChange(listener);

    providerAuthRegistry.setState(createProviderAuthState('tidal', 'expired', true, 2));

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('hydrates from server summary and marks registry as hydrated', () => {
    providerAuthRegistry.hydrateFromServer({
      spotify: createProviderAuthState('spotify', 'ok', true, 3),
      tidal: createProviderAuthState('tidal', 'expired', true, 4),
      anyAuthenticated: true,
    });

    expect(providerAuthRegistry.hasHydratedFromServer()).toBe(true);
    expect(providerAuthRegistry.getState('tidal').code).toBe('expired');
  });

  it('maps auth errors to provider state', () => {
    providerAuthRegistry.setFromAuthError(
      new ProviderAuthError('spotify', 'expired', 'Token expired'),
    );

    const state = providerAuthRegistry.getState('spotify');
    expect(state.code).toBe('expired');
    expect(state.canAttemptRefresh).toBe(true);
  });
});
