/**
 * AdaptiveNav - Generic responsive navigation component
 * 
 * Automatically measures available space and shows items inline when they fit,
 * moving overflow items into a "⋯" dropdown menu.
 * 
 * Supports:
 * - Links (href)
 * - Buttons (onClick)
 * - Toggle buttons (isActive + showCheckmark)
 * - Badges
 * - Separators in menu
 */

'use client';

import { Fragment, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { BurgerMenu } from './AdaptiveNav/BurgerMenu';
import { InlineButton } from './AdaptiveNav/InlineButton';
import { MeasureLayer } from './AdaptiveNav/MeasureLayer';
import { MenuItem } from './AdaptiveNav/MenuItem';
import { OverflowMenu } from './AdaptiveNav/OverflowMenu';
import type { AdaptiveNavProps, NavItem } from './AdaptiveNav/types';
import { useOverflowMeasurement } from './AdaptiveNav/useOverflowMeasurement';
import {
  filterVisibleItems,
  shouldShowSeparator,
  splitInlineAndMenuOnly,
} from './AdaptiveNav/utils';

// ============================================================================
// Types
// ============================================================================

export type { AdaptiveNavProps, NavItem } from './AdaptiveNav/types';

// ============================================================================
// AdaptiveNav Component
// ============================================================================

export function AdaptiveNav({ 
  items, 
  displayMode = 'responsive', 
  layoutMode = 'horizontal',
  burgerIcon,
  dropdownHeader,
  className = '' 
}: AdaptiveNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleItems = useMemo(() => filterVisibleItems(items), [items]);
  const { inlineItems, menuOnlyItems } = useMemo(
    () => splitInlineAndMenuOnly(visibleItems),
    [visibleItems]
  );

  const { visibleCount, effectiveMode } = useOverflowMeasurement({
    containerRef,
    inlineItems,
    displayMode,
    layoutMode,
  });

  const renderMenuItem = useCallback((item: NavItem) => <MenuItem item={item} />, []);

  // Burger menu mode: show all items in a dropdown
  if (layoutMode === 'burger') {
    return (
      <BurgerMenu
        items={visibleItems}
        burgerIcon={burgerIcon}
        renderMenuItem={renderMenuItem}
      />
    );
  }

  // Items that overflow (excluding neverOverflow items)
  const overflowItems = inlineItems.slice(visibleCount).filter(item => !item.neverOverflow);
  // Show overflow menu if there are overflow items, menu-only items, or dropdown header
  const hasOverflow = overflowItems.length > 0 || menuOnlyItems.length > 0 || !!dropdownHeader;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-1 items-center justify-end gap-0.5 overflow-hidden min-w-0',
        className
      )}
    >
      <MeasureLayer inlineItems={inlineItems} displayMode={displayMode} />

      {/* Visible items with group separators */}
      {inlineItems.map((item, index) => {
        const prevItem = index > 0 ? inlineItems[index - 1] ?? null : null;
        const isHidden = index >= visibleCount && !item.neverOverflow;
        const showSeparator = shouldShowSeparator(prevItem, item, isHidden);
        
        return (
          <Fragment key={item.id}>
            {showSeparator && (
              <div className="h-5 w-px bg-border shrink-0" />
            )}
            <InlineButton
              item={item}
              showLabel={effectiveMode === 'with-labels'}
              isHidden={isHidden}
            />
          </Fragment>
        );
      })}

      {/* Overflow menu */}
      {hasOverflow && (
        <OverflowMenu
          overflowItems={overflowItems}
          menuOnlyItems={menuOnlyItems}
          dropdownHeader={dropdownHeader}
          renderMenuItem={renderMenuItem}
        />
      )}
    </div>
  );
}
