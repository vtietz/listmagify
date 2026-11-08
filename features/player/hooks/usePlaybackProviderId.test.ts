import { describe, expect, it } from 'vitest';
import { createDefaultProviderAuthSummary } from '@/lib/providers/types';
import type { ProviderAuthSummary } from '@/lib/providers/types';
import { resolvePlaybackProviderId } from './usePlaybackProviderId';

function summary(connected: Array<'spotify' | 'tidal'>): ProviderAuthSummary {
  const base = createDefaultProviderAuthSummary();
  for (const id of connected) {
    base[id] = { ...base[id], code: 'ok' };
  }
  return { ...base, anyAuthenticated: connected.length > 0 };
}

describe('resolvePlaybackProviderId', () => {
  it('uses Spotify when TIDAL is active but both are connected', () => {
    expect(resolvePlaybackProviderId('tidal', summary(['spotify', 'tidal']))).toBe('spotify');
  });

  it('uses the active provider when it supports playback', () => {
    expect(resolvePlaybackProviderId('spotify', summary(['spotify', 'tidal']))).toBe('spotify');
  });

  it('returns null when only providers without playback are connected', () => {
    expect(resolvePlaybackProviderId('tidal', summary(['tidal']))).toBeNull();
  });

  it('falls back to the active provider before auth is known', () => {
    expect(resolvePlaybackProviderId('spotify', summary([]))).toBe('spotify');
    expect(resolvePlaybackProviderId('tidal', summary([]))).toBeNull();
  });
});
