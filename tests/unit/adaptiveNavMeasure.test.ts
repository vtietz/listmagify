import { describe, expect, it } from 'vitest';
import {
  computeEffectiveMode,
  computeVisibleCount,
  getOverflowButtonWidth,
  measureTotal,
} from '@/components/ui/AdaptiveNav/measure';
import type { NavItem } from '@/components/ui/AdaptiveNav/types';

const makeItem = (id: string, overrides: Partial<NavItem> = {}): NavItem => ({
  id,
  icon: null,
  label: id,
  ...overrides,
});

describe('AdaptiveNav measure helpers', () => {
  it('measureTotal applies inter-item gaps only', () => {
    expect(measureTotal([], 4)).toBe(0);
    expect(measureTotal([10], 4)).toBe(10);
    expect(measureTotal([10, 20, 30], 4)).toBe(68);
  });

  it('computeEffectiveMode prefers labels when they fit', () => {
    const mode = computeEffectiveMode({
      displayMode: 'responsive',
      containerWidth: 120,
      iconWidths: [20, 20, 20],
      labelWidths: [30, 30, 30],
      currentMode: 'icon-only',
      gapWidth: 4,
    });

    expect(mode).toBe('with-labels');
  });

  it('computeEffectiveMode falls back to icons when labels do not fit', () => {
    const mode = computeEffectiveMode({
      displayMode: 'responsive',
      containerWidth: 80,
      iconWidths: [20, 20, 20],
      labelWidths: [40, 40, 40],
      currentMode: 'with-labels',
      gapWidth: 4,
    });

    expect(mode).toBe('icon-only');
  });

  it('computeEffectiveMode honors fixed display modes', () => {
    expect(
      computeEffectiveMode({
        displayMode: 'icon-only',
        containerWidth: 1,
        iconWidths: [100],
        labelWidths: [100],
        currentMode: 'with-labels',
        gapWidth: 0,
      })
    ).toBe('icon-only');

    expect(
      computeEffectiveMode({
        displayMode: 'with-labels',
        containerWidth: 1,
        iconWidths: [100],
        labelWidths: [100],
        currentMode: 'icon-only',
        gapWidth: 0,
      })
    ).toBe('with-labels');
  });

  it('getOverflowButtonWidth clamps invalid and unexpectedly large values', () => {
    expect(getOverflowButtonWidth(undefined)).toBe(36);
    expect(getOverflowButtonWidth(Number.NaN)).toBe(36);
    expect(getOverflowButtonWidth(61)).toBe(36);
    expect(getOverflowButtonWidth(40)).toBe(40);
  });

  it('computeVisibleCount shows all when everything fits', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const count = computeVisibleCount({
      itemWidths: [20, 20, 20],
      inlineItems: items,
      containerWidth: 80,
      overflowButtonWidth: 36,
      gapWidth: 4,
    });

    expect(count).toBe(3);
  });

  it('computeVisibleCount keeps neverOverflow items visible', () => {
    const items = [makeItem('a', { neverOverflow: true }), makeItem('b'), makeItem('c')];
    const count = computeVisibleCount({
      itemWidths: [30, 30, 30],
      inlineItems: items,
      containerWidth: 70,
      overflowButtonWidth: 36,
      gapWidth: 4,
    });

    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('computeVisibleCount avoids overflow menu for only 1-2 hidden items', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c'), makeItem('d')];
    const count = computeVisibleCount({
      itemWidths: [30, 30, 30, 30],
      inlineItems: items,
      containerWidth: 122,
      overflowButtonWidth: 36,
      gapWidth: 4,
    });

    expect(count).toBe(4);
  });
});
