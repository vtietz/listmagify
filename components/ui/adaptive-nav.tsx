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

import { useState, useRef, useEffect, useCallback, useMemo, Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface NavItem {
  id: string;
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
  badge?: ReactNode;
  showCheckmark?: boolean; // Show "✓" when active (for toggles)
  separator?: 'before' | 'after'; // Add separator in menu
  hidden?: boolean; // Completely hide this item
  /** Group identifier - items with same group are rendered together */
  group?: string;
  /** Visibility condition - if false, item is hidden */
  visible?: boolean;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether the item is in loading state */
  loading?: boolean;
  /** Visual variant for the item */
  variant?: 'default' | 'warning' | 'destructive';
  /** Tooltip/title for the button */
  title?: string;
  /** If true, this item will never be moved to the overflow menu */
  neverOverflow?: boolean;
  /** Custom render for the inline button (replaces default rendering) */
  customRender?: (item: NavItem) => ReactNode;
  /** Custom render for the dropdown menu item (replaces default menu item rendering) */
  customMenuRender?: (item: NavItem) => ReactNode;
  /** If true, this item only appears in the dropdown menu, never inline */
  menuOnly?: boolean;
}

export interface AdaptiveNavProps {
  items: NavItem[];
  /** Display mode for inline items - 'responsive' auto-adapts based on space */
  displayMode?: 'icon-only' | 'with-labels' | 'responsive';
  /** Layout mode: 'horizontal' shows inline buttons, 'burger' shows all in dropdown */
  layoutMode?: 'horizontal' | 'burger';
  /** Icon to use for burger menu button */
  burgerIcon?: ReactNode;
  /** Content to render at the top of the dropdown menu (e.g., playlist selector in ultra-compact mode) */
  dropdownHeader?: ReactNode;
  className?: string;
}

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
  const [visibleCount, setVisibleCount] = useState<number>(Infinity);
  const [effectiveMode, setEffectiveMode] = useState<'icon-only' | 'with-labels'>(
    displayMode === 'responsive' ? 'with-labels' : displayMode
  );

  // Filter out hidden items and items with visible=false
  const visibleItems = useMemo(() => {
    return items.filter(item => {
      if (item.hidden) return false;
      if (item.visible !== undefined && !item.visible) return false;
      return true;
    });
  }, [items]);
  
  // Items that should appear inline (not menuOnly)
  const inlineItems = useMemo(() => visibleItems.filter(item => !item.menuOnly), [visibleItems]);
  
  // Items that are menu-only (always in dropdown)
  const menuOnlyItems = useMemo(() => visibleItems.filter(item => item.menuOnly), [visibleItems]);

  // Render menu item (used by both burger menu and overflow menu)
  const renderMenuItem = useCallback((item: NavItem) => {
    // If item has custom menu render, use it
    if (item.customMenuRender) {
      return (
        <Fragment key={item.id}>
          {item.separator === 'before' && <DropdownMenuSeparator />}
          {item.customMenuRender(item)}
          {item.separator === 'after' && <DropdownMenuSeparator />}
        </Fragment>
      );
    }
    
    const menuIcon = (
      <span className={cn(
        "[&>svg]:h-4 [&>svg]:w-4",
        item.loading && "[&>svg]:animate-spin"
      )}>
        {item.icon}
      </span>
    );
    const content = (
      <>
        {menuIcon}
        <span className={cn(
          item.variant === 'warning' && 'text-orange-500',
          item.variant === 'destructive' && 'text-destructive'
        )}>
          {item.label}
        </span>
        {item.showCheckmark && item.isActive && (
          <span className="ml-auto text-xs text-muted-foreground">✓</span>
        )}
        {item.badge && !item.showCheckmark && <span className="ml-auto">{item.badge}</span>}
      </>
    );

    const menuItem = item.href ? (
      <DropdownMenuItem asChild disabled={item.disabled ?? false}>
        <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
          {content}
        </Link>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        onClick={item.disabled ? undefined : item.onClick}
        disabled={(item.disabled || item.loading) ?? false}
        className="flex items-center gap-2 cursor-pointer"
      >
        {content}
      </DropdownMenuItem>
    );

    return (
      <Fragment key={item.id}>
        {item.separator === 'before' && <DropdownMenuSeparator />}
        {menuItem}
        {item.separator === 'after' && <DropdownMenuSeparator />}
      </Fragment>
    );
  }, []);

  // Measure and update visible count (only used for horizontal mode)
  const measureOverflow = useCallback(() => {
    // Skip measurement in burger mode
    if (layoutMode === 'burger') return;
    
    const container = containerRef.current;
    if (!container) return;

    const measureLayer = container.querySelector('[data-measure-layer="true"]');
    if (!measureLayer) return;

    const containerWidth = Math.floor(container.getBoundingClientRect().width);
    const overflowButtonWidth = 36;
    const gapWidth = 4;
    const epsilon = 1; // Tolerance for rounding errors

    // For responsive mode, decide whether labels fit by measuring both layers
    if (displayMode === 'responsive') {
      const labelButtons = Array.from(
        measureLayer.querySelectorAll('[data-measure="labels"]')
      ) as HTMLElement[];
      const iconButtons = Array.from(
        measureLayer.querySelectorAll('[data-measure="icons"]')
      ) as HTMLElement[];

      const measureTotal = (elements: HTMLElement[]) => {
        let total = 0;
        for (const el of elements) {
          total += Math.ceil(el.getBoundingClientRect().width) + gapWidth;
        }
        return total;
      };

      const totalLabels = measureTotal(labelButtons);
      const totalIcons = measureTotal(iconButtons);

      const labelsFit = totalLabels <= containerWidth + epsilon;
      const iconsFit = totalIcons <= containerWidth + epsilon;

      // Switch mode based on what fits
      if (labelsFit && effectiveMode !== 'with-labels') {
        setEffectiveMode('with-labels');
      } else if (!labelsFit && iconsFit && effectiveMode !== 'icon-only') {
        setEffectiveMode('icon-only');
      } else if (!labelsFit && !iconsFit && effectiveMode !== 'icon-only') {
        setEffectiveMode('icon-only');
      }
    }

    // Measure using the effective mode
    const modeKey = effectiveMode === 'with-labels' ? 'labels' : 'icons';
    const itemButtons = Array.from(
      measureLayer.querySelectorAll(`[data-measure="${modeKey}"]`)
    ) as HTMLElement[];
    if (itemButtons.length === 0) return;

    const itemWidths: number[] = [];
    let totalWidth = 0;

    for (const el of itemButtons) {
      const width = Math.ceil(el.getBoundingClientRect().width);
      itemWidths.push(width);
      totalWidth += width + gapWidth;
    }

    // If all items fit without overflow button, show everything
    if (totalWidth <= containerWidth + epsilon) {
      setVisibleCount((prev) => (prev === itemButtons.length ? prev : itemButtons.length));
      return;
    }

    // Calculate how many items fit with overflow button
    // First, account for neverOverflow items which must always be visible
    const neverOverflowIndices = inlineItems
      .map((item, idx) => item.neverOverflow ? idx : -1)
      .filter(idx => idx >= 0);
    
    let reservedWidth = 0;
    for (const idx of neverOverflowIndices) {
      if (idx < itemWidths.length) {
        reservedWidth += (itemWidths[idx] ?? 0) + gapWidth;
      }
    }

    const availableWidth = containerWidth - overflowButtonWidth - gapWidth - reservedWidth;
    let usedWidth = 0;
    let count = 0;

    for (let i = 0; i < itemWidths.length; i++) {
      // neverOverflow items are already accounted for
      if (neverOverflowIndices.includes(i)) {
        count++;
        continue;
      }
      const width = itemWidths[i] ?? 0;
      const itemWidth = width + gapWidth;
      if (usedWidth + itemWidth > availableWidth && count > 0) break;
      usedWidth += itemWidth;
      count++;
    }

    setVisibleCount((prev) => (prev === count ? prev : count));
  }, [displayMode, effectiveMode, layoutMode, inlineItems]);

  // Measure on mount and resize (only for horizontal mode)
  useEffect(() => {
    if (layoutMode === 'burger') return;
    
    const timer = setTimeout(measureOverflow, 50);

    const observer = new ResizeObserver(() => {
      measureOverflow();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [measureOverflow, layoutMode]);

  // Re-measure when items change (only for horizontal mode)
  const itemCount = visibleItems.length;
  useEffect(() => {
    if (layoutMode === 'burger') return;
    
    const timer = setTimeout(measureOverflow, 0);
    return () => clearTimeout(timer);
  }, [itemCount, measureOverflow, layoutMode]);

  // Burger menu mode: show all items in a dropdown
  if (layoutMode === 'burger') {
    // Group items by their group property
    const groupedItems = visibleItems.reduce((acc, item) => {
      const groupKey = item.group || 'default';
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(item);
      return acc;
    }, {} as Record<string, NavItem[]>);

    const groupKeys = Object.keys(groupedItems);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            {burgerIcon || <MoreHorizontal className="h-4 w-4" />}
            <span className="sr-only">Menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {groupKeys.map((groupKey, groupIndex) => {
            const groupItems = groupedItems[groupKey];
            if (!groupItems) return null;
            return (
              <div key={groupKey}>
                {groupIndex > 0 && <DropdownMenuSeparator />}
                {groupItems.map((item) => renderMenuItem(item))}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Items that overflow (excluding neverOverflow items)
  const overflowItems = inlineItems.slice(visibleCount).filter(item => !item.neverOverflow);
  // Show overflow menu if there are overflow items, menu-only items, or dropdown header
  const hasOverflow = overflowItems.length > 0 || menuOnlyItems.length > 0 || !!dropdownHeader;

  // Render inline button
  const renderInlineButton = (item: NavItem, index: number) => {
    // neverOverflow items are always visible
    const isHidden = index >= visibleCount && !item.neverOverflow;
    
    // If item has custom render, use it
    if (item.customRender) {
      return (
        <div key={item.id} className={cn(isHidden && 'hidden')}>
          {item.customRender(item)}
        </div>
      );
    }
    
    const showLabel = effectiveMode === 'with-labels';
    const buttonContent = (
      <>
        <span className={cn(item.loading && "[&>svg]:animate-spin")}>{item.icon}</span>
        {showLabel && <span>{item.label}</span>}
        {item.badge}
      </>
    );

    const buttonClasses = cn(
      'h-7 px-1.5 gap-1 cursor-pointer shrink-0',
      isHidden && 'hidden',
      item.variant === 'warning' && 'text-orange-500 hover:text-orange-600',
      item.variant === 'destructive' && 'text-destructive hover:text-destructive'
    );

    if (item.href) {
      return (
        <Button
          key={item.id}
          variant={item.isActive ? 'secondary' : 'ghost'}
          size="sm"
          asChild
          className={buttonClasses}
          data-nav-item={item.id}
        >
          <Link href={item.href} title={item.title || item.label}>{buttonContent}</Link>
        </Button>
      );
    }

    return (
      <Button
        key={item.id}
        variant={item.isActive ? 'secondary' : 'ghost'}
        size="sm"
        onClick={item.disabled ? undefined : item.onClick}
        disabled={item.disabled || item.loading}
        className={buttonClasses}
        data-nav-item={item.id}
        title={item.title || item.label}
      >
        {buttonContent}
      </Button>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-1 items-center justify-end gap-0.5 overflow-hidden min-w-0 ${className}`}
    >
      {/* Hidden measuring layer - renders both icon-only and with-labels versions */}
      <div
        className="absolute invisible pointer-events-none flex items-center gap-0.5"
        aria-hidden="true"
        data-measure-layer="true"
      >
        {/* Icon-only measurements */}
        {inlineItems.map((item) => (
          <Button
            key={`measure-icons-${item.id}`}
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 gap-1 shrink-0"
            data-measure="icons"
            tabIndex={-1}
          >
            {item.icon}
            {item.badge}
          </Button>
        ))}
        {/* With-labels measurements (only for responsive mode) */}
        {displayMode === 'responsive' && inlineItems.map((item) => (
          <Button
            key={`measure-labels-${item.id}`}
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 gap-1 shrink-0"
            data-measure="labels"
            tabIndex={-1}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </Button>
        ))}
      </div>

      {/* Visible items with group separators */}
      {inlineItems.map((item, index) => {
        const prevItem = index > 0 ? inlineItems[index - 1] : null;
        const showSeparator = prevItem && item.group && prevItem.group !== item.group;
        const isHidden = index >= visibleCount && !item.neverOverflow;
        
        return (
          <Fragment key={item.id}>
            {showSeparator && !isHidden && (
              <div className="h-5 w-px bg-border shrink-0" />
            )}
            {renderInlineButton(item, index)}
          </Fragment>
        );
      })}

      {/* Overflow menu */}
      {hasOverflow && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-1.5 shrink-0" title="More options">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Dropdown header (e.g., playlist selector in ultra-compact mode) */}
            {dropdownHeader}
            {dropdownHeader && (overflowItems.length > 0 || menuOnlyItems.length > 0) && (
              <DropdownMenuSeparator />
            )}
            {/* Menu-only items with group separators */}
            {menuOnlyItems.map((item, index) => {
              const prevItem = index > 0 ? menuOnlyItems[index - 1] : null;
              const showSeparator = prevItem && item.group && prevItem.group !== item.group;
              return (
                <Fragment key={item.id}>
                  {showSeparator && <DropdownMenuSeparator />}
                  {renderMenuItem(item)}
                </Fragment>
              );
            })}
            {menuOnlyItems.length > 0 && overflowItems.length > 0 && (
              <DropdownMenuSeparator />
            )}
            {/* Overflow items with group separators */}
            {overflowItems.map((item, index) => {
              const prevItem = index > 0 ? overflowItems[index - 1] : (menuOnlyItems.length > 0 ? menuOnlyItems[menuOnlyItems.length - 1] : null);
              const showSeparator = prevItem && item.group && prevItem.group !== item.group;
              return (
                <Fragment key={item.id}>
                  {showSeparator && <DropdownMenuSeparator />}
                  {renderMenuItem(item)}
                </Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
