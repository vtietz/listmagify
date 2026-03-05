import type { NavItem } from './types';

export function filterVisibleItems(items: NavItem[]): NavItem[] {
  return items.filter((item) => !item.hidden && item.visible !== false);
}

export function splitInlineAndMenuOnly(items: NavItem[]): {
  inlineItems: NavItem[];
  menuOnlyItems: NavItem[];
} {
  return {
    inlineItems: items.filter((item) => !item.menuOnly),
    menuOnlyItems: items.filter((item) => item.menuOnly),
  };
}

export function groupBy<T>(items: T[], getGroupKey: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((accumulator, item) => {
    const key = getGroupKey(item);
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(item);
    return accumulator;
  }, {});
}

export function shouldShowSeparator(
  previousItem: NavItem | null,
  currentItem: NavItem,
  isCurrentHidden = false
): boolean {
  return !!(
    previousItem &&
    !isCurrentHidden &&
    currentItem.group &&
    previousItem.group !== currentItem.group
  );
}
