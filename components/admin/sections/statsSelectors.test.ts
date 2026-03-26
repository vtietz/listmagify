import { describe, expect, it } from 'vitest';
import { buildOverviewCards } from '@/components/admin/sections/statsSelectors';

describe('buildOverviewCards', () => {
  it('returns loading placeholders when overview/recs are loading', () => {
    const cards = buildOverviewCards({
      overviewLoading: true,
      recsLoading: true,
      kpis: undefined,
      overviewData: undefined,
      recsData: undefined,
      dateRange: { from: '2026-01-01', to: '2026-01-31' },
    });

    expect(cards).toHaveLength(5);
    expect(cards[0]?.value).toBe('...');
    expect(cards[1]?.value).toBe('...');
    expect(cards[2]?.value).toBe('...');
    expect(cards[3]?.value).toBe('...');
    expect(cards[4]?.value).toBe('...');
  });

  it('maps KPI and DB values when data is present', () => {
    const cards = buildOverviewCards({
      overviewLoading: false,
      recsLoading: false,
      kpis: {
        activeUsers: 5,
        totalEvents: 11,
        totalSessions: 7,
      } as any,
      overviewData: {
        data: {} as any,
        dbStats: { sizeBytes: 1024, sizeMB: 1 },
      },
      recsData: { totalTracks: 42 } as any,
      dateRange: { from: '2026-01-01', to: '2026-01-31' },
    });

    expect(cards[0]?.value).toBe(5);
    expect(cards[1]?.value).toBe(11);
    expect(cards[2]?.value).toBe(7);
    expect(cards[3]?.value).toBe(42);
    expect(cards[4]?.value).toBe('1 MB');
  });
});
