import { describe, expect, it } from 'vitest';
import { mapPlaylistMetadata } from '@/lib/repositories/playlistRepository';

describe('mapPlaylistMetadata', () => {
  it('maps owner and totals with null-safe fallbacks', () => {
    const result = mapPlaylistMetadata({
      id: 'pl-1',
      name: 'Playlist',
      description: null,
      owner: { id: 'u-1', display_name: 'Owner Name' },
      collaborative: null,
      tracks: { total: 12 },
      tracksTotal: 0,
      public: true,
    } as any);

    expect(result.id).toBe('pl-1');
    expect(result.owner.displayName).toBe('Owner Name');
    expect(result.tracksTotal).toBe(0);
    expect(result.isPublic).toBe(true);
    expect(result.collaborative).toBe(false);
  });

  it('defaults public flag to false when missing', () => {
    const result = mapPlaylistMetadata({
      id: 'pl-2',
      name: 'No public flag',
    } as any);

    expect(result.isPublic).toBe(false);
  });
});
