import { describe, expect, it } from 'vitest';
import { normalizeText, normalizeTrackSignals, tokenSimilarity } from '@/lib/resolver/normalize';

describe('canonical resolver normalization', () => {
  it('normalizes common track suffix noise', () => {
    expect(normalizeText('Song Title (Remastered 2011) [Live Version]')).toBe('song title');
  });

  it('builds normalized title/artist signals with rounded duration', () => {
    const signals = normalizeTrackSignals({
      title: '  My Song  ',
      artists: ['B Artist', 'A Artist'],
      durationMs: 181499,
    });

    expect(signals).toEqual({
      titleNorm: 'my song',
      artistNorm: 'a artist b artist',
      durationSec: 181,
    });
  });

  it('computes token overlap similarity', () => {
    expect(tokenSimilarity('my song title', 'song title')).toBeGreaterThan(0.6);
    expect(tokenSimilarity('alpha beta', 'gamma delta')).toBe(0);
  });
});
