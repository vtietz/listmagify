/**
 * AdaptiveToolbar - A responsive toolbar that adapts to available space.
 * 
 * Shows items inline when there's enough space, and collapses overflow items
 * into a "⋯" dropdown menu when space is limited.
 * 
 * Usage:
 * - displayMode="icon-only": Compact mode for panel toolbars
 * - displayMode="with-labels": Full labels for main navigation
 * - displayMode="responsive": Labels on wide screens, icons only on narrow
 */

'use client';

import { createElement, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ToolbarAction {
  /** Unique identifier for the action */
  id: string;
  /** Icon component to display */
  icon: LucideIcon;
  /** Label text (shown in dropdown and optionally inline) */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Optional href for link items */
  href?: string;
  /** Whether the action is disabled */
  disabled?: boolean;
  /** Whether the action is hidden */
  hidden?: boolean;
  /** Whether the action is active/selected */
  active?: boolean;
  /** Visual variant */
  variant?: 'default' | 'destructive' | 'warning';
  /** Show separator before this item in dropdown */
  separatorBefore?: boolean;
  /** Show separator after this item in dropdown */
  separatorAfter?: boolean;
  /** Badge content (e.g., count) */
  badge?: string | number;
  /** Whether the item is loading */
  loading?: boolean;
  /** Custom icon to show when loading */
  loadingIcon?: LucideIcon;
  /** Tooltip/title for the button */
  title?: string;
  /** Custom render for inline button (overrides default) */
  customRender?: () => ReactNode;
  /** Custom render for dropdown item (overrides default) */
  customMenuRender?: () => ReactNode;
  /** If true, never show inline; only show in overflow menu */
  menuOnly?: boolean;
}

export interface AdaptiveToolbarProps {
  /** Array of toolbar actions */
  actions: ToolbarAction[];
  /** Display mode for inline items */
  displayMode?: 'icon-only' | 'with-labels' | 'responsive';
  /** Additional class name for the container */
  className?: string;
  /** Width in pixels for icon-only buttons (default: 32) */
  iconButtonWidth?: number;
  /** Width in pixels for buttons with labels (default: 100) */
  labelButtonWidth?: number;
  /** Gap between items in pixels (default: 4) */
  gap?: number;
  /** Button size variant */
  buttonSize?: 'sm' | 'default' | 'lg';
  /** Button height class */
  buttonHeight?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ICON_BUTTON_WIDTH = 32;
const DEFAULT_LABEL_BUTTON_WIDTH = 100;
const DEFAULT_GAP = 4;
const OVERFLOW_BUTTON_WIDTH = 32;
const MEASURE_EPSILON_PX = 1;

type EffectiveMode = 'icon-only' | 'with-labels';

function getInitialEffectiveMode(displayMode: AdaptiveToolbarProps['displayMode']): EffectiveMode {
  return displayMode === 'responsive' ? 'with-labels' : (displayMode ?? 'icon-only');
}

function measureTotalWidth(elements: HTMLElement[], gap: number): number {
  let total = 0;
  for (const el of elements) {
    total += Math.ceil(el.getBoundingClientRect().width) + gap;
  }
  return total;
}

function resolveResponsiveMode(
  totalLabels: number,
  totalIcons: number,
  fullFitWidth: number
): EffectiveMode {
  const labelsFit = totalLabels <= fullFitWidth + MEASURE_EPSILON_PX;
  if (labelsFit) {
    return 'with-labels';
  }

  const iconsFit = totalIcons <= fullFitWidth + MEASURE_EPSILON_PX;
  if (iconsFit) {
    return 'icon-only';
  }

  return 'icon-only';
}

function getVisibleCountFromWidths(
  itemWidths: number[],
  containerWidth: number,
  gap: number,
  overflowMustShow: boolean
): number {
  const fullFitWidth = overflowMustShow
    ? containerWidth - OVERFLOW_BUTTON_WIDTH - gap
    : containerWidth;
  const totalWidth = itemWidths.reduce((sum, width) => sum + width + gap, 0);

  if (totalWidth <= fullFitWidth + MEASURE_EPSILON_PX) {
    return Infinity;
  }

  const availableWidth = containerWidth - OVERFLOW_BUTTON_WIDTH - gap;
  let usedWidth = 0;
  let count = 0;

  for (const width of itemWidths) {
    const itemWidth = width + gap;
    if (usedWidth + itemWidth > availableWidth && count > 0) {
      break;
    }
    usedWidth += itemWidth;
    count++;
  }

  return count;
}

function splitInlineAndOverflowActions(
  inlineCandidates: ToolbarAction[],
  visibleCount: number
): { inlineActions: ToolbarAction[]; overflowActions: ToolbarAction[] } {
  if (visibleCount === Infinity) {
    return { inlineActions: inlineCandidates, overflowActions: [] };
  }

  return {
    inlineActions: inlineCandidates.slice(0, visibleCount),
    overflowActions: inlineCandidates.slice(visibleCount),
  };
}

function getBadgeClasses(variant: ToolbarAction['variant'], isMenuItem: boolean): string {
  const base = isMenuItem
    ? 'text-xs font-medium px-1.5 py-0.5 rounded-full ml-auto'
    : 'text-xs font-medium px-1.5 py-0.5 rounded-full ml-1';

  const variantClasses: Record<NonNullable<ToolbarAction['variant']> | 'default', string> = {
    default: 'bg-muted text-muted-foreground',
    warning: 'bg-orange-500 text-white',
    destructive: 'bg-destructive text-destructive-foreground',
  };

  const variantKey = variant ?? 'default';
  return cn(base, variantClasses[variantKey]);
}

function getInlineVariantClasses(variant: ToolbarAction['variant']): string {
  const classMap: Record<NonNullable<ToolbarAction['variant']>, string> = {
    default: '',
    warning: 'text-orange-500 hover:text-orange-600',
    destructive: 'text-destructive hover:text-destructive',
  };

  if (!variant || variant === 'default') {
    return '';
  }

  return classMap[variant];
}

function getMenuVariantClasses(variant: ToolbarAction['variant']): string {
  const classMap: Record<NonNullable<ToolbarAction['variant']>, string> = {
    default: '',
    warning: 'text-orange-500 focus:text-orange-600',
    destructive: 'text-destructive focus:text-destructive',
  };

  if (!variant || variant === 'default') {
    return '';
  }

  return classMap[variant];
}

function renderToolbarActionIcon(action: ToolbarAction, className: string): ReactNode {
  const IconComponent = action.loading && action.loadingIcon ? action.loadingIcon : action.icon;
  return createElement(IconComponent, {
    className: cn(className, action.loading && 'animate-spin'),
  });
}

function renderOverflowContent(action: ToolbarAction): ReactNode {
  return (
    <>
      {renderToolbarActionIcon(action, 'h-4 w-4 mr-2')}
      <span className="flex-1">{action.label}</span>
      {action.badge !== undefined && (
        <span className={getBadgeClasses(action.variant, true)}>
          {action.badge}
        </span>
      )}
      {action.active && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
    </>
  );
}

function renderOverflowInteractiveItem(
  action: ToolbarAction,
  itemClasses: string,
  itemContent: ReactNode
): ReactNode {
  if (action.href) {
    return (
      <DropdownMenuItem asChild disabled={action.disabled || false}>
        <a href={action.href} className={itemClasses}>
          {itemContent}
        </a>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      onClick={action.onClick}
      disabled={action.disabled || action.loading || false}
      className={itemClasses}
    >
      {itemContent}
    </DropdownMenuItem>
  );
}

// ============================================================================
// AdaptiveToolbar Component
// ============================================================================

export function AdaptiveToolbar({
  actions,
  displayMode = 'icon-only',
  className,
  iconButtonWidth = DEFAULT_ICON_BUTTON_WIDTH,
  labelButtonWidth = DEFAULT_LABEL_BUTTON_WIDTH,
  gap = DEFAULT_GAP,
  buttonSize = 'sm',
  buttonHeight = 'h-8',
}: AdaptiveToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(Infinity);
  const [effectiveMode, setEffectiveMode] = useState<EffectiveMode>(
    getInitialEffectiveMode(displayMode)
  );

  // Filter out hidden actions
  const visibleActions = actions.filter((action) => !action.hidden);

  // Actions that can appear inline (affect measurement)
  const inlineCandidates = visibleActions.filter((action) => !action.menuOnly);

  // Actions that should only appear in the overflow menu
  const menuOnlyActions = visibleActions.filter((action) => action.menuOnly);
  const menuOnlyCount = menuOnlyActions.length;

  const doMeasure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureLayer = container.querySelector('[data-measure-layer="true"]');
    if (!measureLayer) return;

    const containerWidth = Math.floor(container.getBoundingClientRect().width);

    const overflowMustShow = menuOnlyCount > 0;
    const fullFitWidth = overflowMustShow
      ? containerWidth - OVERFLOW_BUTTON_WIDTH - gap
      : containerWidth;

    if (displayMode === 'responsive') {
      const labelButtons = Array.from(
        measureLayer.querySelectorAll('[data-measure="labels"]')
      ) as HTMLElement[];
      const iconButtons = Array.from(
        measureLayer.querySelectorAll('[data-measure="icons"]')
      ) as HTMLElement[];

      const totalLabels = measureTotalWidth(labelButtons, gap);
      const totalIcons = measureTotalWidth(iconButtons, gap);
      const nextMode = resolveResponsiveMode(totalLabels, totalIcons, fullFitWidth);
      if (nextMode !== effectiveMode) {
        setEffectiveMode(nextMode);
      }
    }

    const modeKey = effectiveMode === 'with-labels' ? 'labels' : 'icons';
    const itemButtons = Array.from(
      measureLayer.querySelectorAll(`[data-measure="${modeKey}"]`)
    ) as HTMLElement[];
    if (itemButtons.length === 0) return;

    const itemWidths = itemButtons.map((el) => Math.ceil(el.getBoundingClientRect().width));
    const nextVisibleCount = getVisibleCountFromWidths(
      itemWidths,
      containerWidth,
      gap,
      overflowMustShow
    );

    setVisibleCount((prev) => (prev === nextVisibleCount ? prev : nextVisibleCount));
  }, [displayMode, effectiveMode, gap, menuOnlyCount]);

  const measureOverflow = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      doMeasure();
    });
  }, [doMeasure]);

  // Set up resize observer
  useEffect(() => {
    measureOverflow();
    
    const observer = new ResizeObserver(() => {
      measureOverflow();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [measureOverflow]);

  // Re-measure when actions change
  useEffect(() => {
    measureOverflow();
  }, [actions, measureOverflow]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Split actions into visible and overflow (inline candidates only)
  const { inlineActions, overflowActions } = splitInlineAndOverflowActions(inlineCandidates, visibleCount);
  const hasOverflow = overflowActions.length > 0 || menuOnlyActions.length > 0;

  return (
    <div 
      ref={containerRef} 
      className={cn('relative flex items-center min-w-0', className)}
      style={{ gap: `${gap}px` }}
    >
      {/* Hidden measuring layer - always renders all actions for stable measurement */}
      <div
        className="absolute invisible pointer-events-none flex items-center"
        aria-hidden="true"
        data-measure-layer="true"
        style={{ gap: `${gap}px` }}
      >
        {inlineCandidates.map((action) => (
          <Button
            key={`measure-icons-${action.id}`}
            variant="ghost"
            size={buttonSize}
            className={cn(buttonHeight, 'p-0 shrink-0')}
            style={{ width: `${iconButtonWidth}px` }}
            data-measure="icons"
            tabIndex={-1}
          >
            <action.icon className="h-4 w-4" />
          </Button>
        ))}
        {displayMode !== 'icon-only' && (
          <>
            {inlineCandidates.map((action) => (
              <Button
                key={`measure-labels-${action.id}`}
                variant="ghost"
                size={buttonSize}
                className={cn(buttonHeight, 'shrink-0')}
                style={{ width: `${labelButtonWidth}px` }}
                data-measure="labels"
                tabIndex={-1}
              >
                <action.icon className="h-4 w-4" />
                <span className="ml-2">{action.label}</span>
              </Button>
            ))}
          </>
        )}
      </div>

      {/* Inline area: can clip overflowed buttons */}
      <div className="flex flex-1 min-w-0 items-center overflow-hidden" style={{ gap: `${gap}px` }}>
        {inlineActions.map((action) => (
          <InlineButton
            key={action.id}
            action={action}
            showLabel={effectiveMode === 'with-labels'}
            buttonSize={buttonSize}
            buttonHeight={buttonHeight}
          />
        ))}
      </div>

      {/* Overflow dropdown button: never clipped */}
      {hasOverflow && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size={buttonSize}
              className={cn(buttonHeight, 'w-8 p-0 shrink-0')}
              title="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 max-h-[70vh] overflow-y-auto">
            {menuOnlyActions.map((action, index) => (
              <OverflowMenuItem
                key={action.id}
                action={action}
                isFirst={index === 0}
              />
            ))}
            {menuOnlyActions.length > 0 && overflowActions.length > 0 && (
              <DropdownMenuSeparator />
            )}
            {overflowActions.map((action, index) => (
              <OverflowMenuItem
                key={action.id}
                action={action}
                isFirst={menuOnlyActions.length === 0 && index === 0}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ============================================================================
// InlineButton - Button rendered inline in the toolbar
// ============================================================================

interface InlineButtonProps {
  action: ToolbarAction;
  showLabel: boolean;
  buttonSize: 'sm' | 'default' | 'lg';
  buttonHeight: string;
}

function InlineButton({ action, showLabel, buttonSize, buttonHeight }: InlineButtonProps) {
  if (action.customRender) {
    return <>{action.customRender()}</>;
  }

  const isLink = !!action.href;
  const title = action.title || action.label;
  const buttonVariant = action.active ? 'secondary' : 'ghost';
  
  const buttonContent = (
    <>
      {renderToolbarActionIcon(action, 'h-4 w-4')}
      {showLabel && <span className="truncate">{action.label}</span>}
      {action.badge !== undefined && (
        <span className={getBadgeClasses(action.variant, false)}>
          {action.badge}
        </span>
      )}
    </>
  );

  const buttonClasses = cn(
    buttonHeight,
    showLabel ? 'px-2 gap-1.5' : 'w-8 p-0',
    'shrink-0',
    getInlineVariantClasses(action.variant),
    action.active && 'bg-secondary'
  );

  if (isLink) {
    return (
      <Button
        variant={buttonVariant}
        size={buttonSize}
        asChild
        className={buttonClasses}
        title={title}
      >
        <a href={action.href}>
          {buttonContent}
        </a>
      </Button>
    );
  }

  return (
    <Button
      variant={buttonVariant}
      size={buttonSize}
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      className={buttonClasses}
      title={title}
    >
      {buttonContent}
    </Button>
  );
}

// ============================================================================
// OverflowMenuItem - Item rendered in the overflow dropdown
// ============================================================================

interface OverflowMenuItemProps {
  action: ToolbarAction;
  isFirst: boolean;
}

function OverflowMenuItem({ action, isFirst }: OverflowMenuItemProps) {
  if (action.customMenuRender) {
    return (
      <>
        {action.separatorBefore && !isFirst && <DropdownMenuSeparator />}
        {action.customMenuRender()}
        {action.separatorAfter && <DropdownMenuSeparator />}
      </>
    );
  }

  const itemContent = renderOverflowContent(action);

  const itemClasses = cn(
    'flex items-center gap-2 cursor-pointer',
    getMenuVariantClasses(action.variant)
  );

  return (
    <>
      {action.separatorBefore && !isFirst && <DropdownMenuSeparator />}
      {renderOverflowInteractiveItem(action, itemClasses, itemContent)}
      {action.separatorAfter && <DropdownMenuSeparator />}
    </>
  );
}
