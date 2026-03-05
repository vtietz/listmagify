import type { EffectiveDisplayMode, NavItem } from './types';

const EPSILON = 1;
const DEFAULT_OVERFLOW_BUTTON_WIDTH = 36;
const MAX_OVERFLOW_BUTTON_WIDTH = 60;

export function measureTotal(widths: number[], gapWidth: number): number {
  if (widths.length === 0) {
    return 0;
  }
  const total = widths.reduce((sum, width) => sum + width + gapWidth, 0);
  return total - gapWidth;
}

export function computeEffectiveMode(params: {
  displayMode: 'icon-only' | 'with-labels' | 'responsive';
  containerWidth: number;
  iconWidths: number[];
  labelWidths: number[];
  currentMode: EffectiveDisplayMode;
  gapWidth: number;
}): EffectiveDisplayMode {
  const { displayMode, containerWidth, iconWidths, labelWidths, currentMode, gapWidth } = params;

  if (displayMode !== 'responsive') {
    return displayMode;
  }

  const labelsFit = measureTotal(labelWidths, gapWidth) <= containerWidth + EPSILON;
  if (labelsFit) {
    return 'with-labels';
  }

  const iconsFit = measureTotal(iconWidths, gapWidth) <= containerWidth + EPSILON;
  if (iconsFit) {
    return 'icon-only';
  }

  return currentMode === 'with-labels' ? 'icon-only' : currentMode;
}

export function getOverflowButtonWidth(measuredWidth?: number): number {
  if (!measuredWidth || !Number.isFinite(measuredWidth)) {
    return DEFAULT_OVERFLOW_BUTTON_WIDTH;
  }
  return measuredWidth > MAX_OVERFLOW_BUTTON_WIDTH
    ? DEFAULT_OVERFLOW_BUTTON_WIDTH
    : measuredWidth;
}

export function computeVisibleCount(params: {
  itemWidths: number[];
  inlineItems: NavItem[];
  containerWidth: number;
  overflowButtonWidth: number;
  gapWidth: number;
}): number {
  const { itemWidths, inlineItems, containerWidth, overflowButtonWidth, gapWidth } = params;

  if (itemWidths.length === 0) {
    return 0;
  }

  const totalWidth = measureTotal(itemWidths, gapWidth);
  if (totalWidth <= containerWidth + EPSILON) {
    return itemWidths.length;
  }

  const neverOverflowIndices = inlineItems
    .map((item, index) => (item.neverOverflow ? index : -1))
    .filter((index) => index >= 0);

  const reservedWidth = measureReservedWidth(itemWidths, neverOverflowIndices, gapWidth);
  const availableWidth = containerWidth - overflowButtonWidth - gapWidth - reservedWidth;
  let count = countFittingItems({
    itemWidths,
    neverOverflowIndices,
    reservedWidth,
    gapWidth,
    availableWidth,
  });

  if (count < itemWidths.length && count > 0) {
    count += 1;
  }

  const overflowCount = inlineItems.length - count;
  if (overflowCount > 0 && overflowCount <= 2) {
    return inlineItems.length;
  }

  return count;
}

function countFittingItems(params: {
  itemWidths: number[];
  neverOverflowIndices: number[];
  reservedWidth: number;
  gapWidth: number;
  availableWidth: number;
}): number {
  const { itemWidths, neverOverflowIndices, reservedWidth, gapWidth, availableWidth } = params;
  let usedWidth = 0;
  let count = 0;

  for (const [index, width] of itemWidths.entries()) {
    if (neverOverflowIndices.includes(index)) {
      count += 1;
      continue;
    }

    const needsGap = usedWidth > 0 || reservedWidth > 0;
    const nextWidth = width + (needsGap ? gapWidth : 0);

    if (usedWidth + nextWidth > availableWidth && count > 0) {
      break;
    }

    usedWidth += nextWidth;
    count += 1;
  }

  return count;
}

function measureReservedWidth(
  itemWidths: number[],
  reservedIndices: number[],
  gapWidth: number
): number {
  if (reservedIndices.length === 0) {
    return 0;
  }

  const total = reservedIndices.reduce((sum, index) => {
    const width = itemWidths[index] ?? 0;
    return sum + width + gapWidth;
  }, 0);

  return total - gapWidth;
}
