import { describe, expect, it } from 'vitest';
import { buildReorderedUris } from '@/lib/sync/applySide';

describe('buildReorderedUris', () => {
  it('places tracks by the canonical ID of the URI actually in the playlist', () => {
    // "lovefool-release-a" is the entry in the playlist; the preferred mapping for
    // canonical "lovefool" may point at another release, which must not matter.
    const current = ['sp:other', 'sp:saxobeat-radio-edit', 'sp:lovefool-release-a', 'sp:fred'];
    const canonicalByUri = new Map([
      ['sp:fred', 'fred'],
      ['sp:lovefool-release-a', 'lovefool'],
      ['sp:saxobeat-radio-edit', 'saxobeat'],
      ['sp:other', 'other'],
    ]);

    const ordered = buildReorderedUris(current, canonicalByUri, ['fred', 'lovefool', 'saxobeat', 'other']);

    expect(ordered).toEqual(['sp:fred', 'sp:lovefool-release-a', 'sp:saxobeat-radio-edit', 'sp:other']);
  });

  it('keeps duplicates together and never drops entries', () => {
    const current = ['sp:b', 'sp:a', 'sp:c', 'sp:a'];
    const canonicalByUri = new Map([['sp:a', 'a'], ['sp:b', 'b'], ['sp:c', 'c']]);

    const ordered = buildReorderedUris(current, canonicalByUri, ['a', 'b', 'c']);

    expect(ordered).toEqual(['sp:a', 'sp:a', 'sp:b', 'sp:c']);
  });

  it('keeps unmapped or unordered entries at the end in their relative order', () => {
    const current = ['sp:unknown-1', 'sp:b', 'sp:unknown-2', 'sp:a'];
    const canonicalByUri = new Map([['sp:a', 'a'], ['sp:b', 'b']]);

    const ordered = buildReorderedUris(current, canonicalByUri, ['a', 'b']);

    expect(ordered).toEqual(['sp:a', 'sp:b', 'sp:unknown-1', 'sp:unknown-2']);
  });

  it('treats the first desired position as rank 0', () => {
    const ordered = buildReorderedUris(['sp:b', 'sp:a'], new Map([['sp:a', 'a'], ['sp:b', 'b']]), ['a', 'b']);

    expect(ordered).toEqual(['sp:a', 'sp:b']);
  });
});
