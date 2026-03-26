import { describe, expect, it } from 'vitest';
import { isTrackIdCompatibleWithProvider } from '@/lib/providers/trackIdCompat';

describe('trackIdCompat', () => {
  it('accepts spotify-style base62 ids for spotify', () => {
    expect(isTrackIdCompatibleWithProvider('4oBsr1AQT9FtRK1EkzflAC', 'spotify')).toBe(true);
  });

  it('rejects numeric tidal id for spotify', () => {
    expect(isTrackIdCompatibleWithProvider('25449260', 'spotify')).toBe(false);
  });

  it('accepts numeric and uuid ids for tidal', () => {
    expect(isTrackIdCompatibleWithProvider('25449260', 'tidal')).toBe(true);
    expect(isTrackIdCompatibleWithProvider('2fd4e7cd-0acb-4e82-badb-df965b039e65', 'tidal')).toBe(true);
  });
});
