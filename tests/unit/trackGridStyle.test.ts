import { describe, expect, it } from 'vitest';
import { getTrackGridStyle } from '@/components/split-editor/TableHeader';

describe('getTrackGridStyle', () => {
  it('builds default columns with cumulative time', () => {
    const result = getTrackGridStyle(true, true, false);

    expect(result.gridTemplateColumns).toBe(
      '20px 20px 20px 28px minmax(100px, 3fr) minmax(60px, 1.5fr) minmax(60px, 1fr) 36px 36px 44px 52px'
    );
  });

  it('builds optional columns in expected order', () => {
    const result = getTrackGridStyle(false, false, true, {
      showDragHandle: true,
      showMatchStatusColumn: true,
      showCustomAddColumn: true,
      showScrobbleDateColumn: true,
      showCumulativeTime: false,
    });

    expect(result.gridTemplateColumns).toBe(
      '44px 20px 20px 20px 20px 28px minmax(100px, 3fr) minmax(60px, 1.5fr) minmax(60px, 1fr) 90px 36px 44px'
    );
  });
});
