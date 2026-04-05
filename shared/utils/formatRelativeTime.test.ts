import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from './formatRelativeTime';

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats sqlite timestamps as UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T21:00:30.000Z'));

    expect(formatRelativeTime('2026-04-05 21:00:00')).toBe('just now');
  });

  it('returns just now for invalid dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T21:00:30.000Z'));

    expect(formatRelativeTime('not-a-date')).toBe('just now');
  });
});
