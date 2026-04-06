import { describe, expect, it } from 'vitest';

import {
  getProviderLikedSongsDisplayName,
  toProviderTrackId,
  toProviderTrackUri,
} from './trackCodec';

describe('toProviderTrackUri', () => {
  it('builds spotify track URIs from plain IDs', () => {
    expect(toProviderTrackUri('spotify', '4iV5W9uYEdYUVa79Axb7Rh')).toBe(
      'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
    );
  });

  it('builds tidal track URIs from plain IDs', () => {
    expect(toProviderTrackUri('tidal', '12345678')).toBe('tidal:track:12345678');
  });

  it('passes through values that are already URIs', () => {
    expect(toProviderTrackUri('spotify', 'spotify:track:abc')).toBe('spotify:track:abc');
    expect(toProviderTrackUri('tidal', 'tidal:track:123')).toBe('tidal:track:123');
  });
});

describe('toProviderTrackId', () => {
  it('strips spotify URI prefixes', () => {
    expect(toProviderTrackId('spotify', 'spotify:track:abc')).toBe('abc');
  });

  it('strips tidal URI prefixes', () => {
    expect(toProviderTrackId('tidal', 'tidal:track:123')).toBe('123');
  });

  it('passes through plain IDs', () => {
    expect(toProviderTrackId('spotify', 'abc')).toBe('abc');
    expect(toProviderTrackId('tidal', '123')).toBe('123');
  });

  it('does not strip prefixes from other providers', () => {
    expect(toProviderTrackId('tidal', 'spotify:track:abc')).toBe('spotify:track:abc');
  });
});

describe('getProviderLikedSongsDisplayName', () => {
  it('returns provider-specific liked songs labels', () => {
    expect(getProviderLikedSongsDisplayName('spotify')).toBe('Liked Songs');
    expect(getProviderLikedSongsDisplayName('tidal')).toBe('My Tracks');
  });
});
