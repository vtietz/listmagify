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

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
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
  const [effectiveMode, setEffectiveMode] = useState<'icon-only' | 'with-labels'>(
    displayMode === 'responsive' ? 'with-labels' : displayMode
  );

  // Filter out hidden actions
  const visibleActions = actions.filter((action) => !action.hidden);

  // Actions that can appear inline (affect measurement)
  const inlineCandidates = visibleActions.filter((action) => !action.menuOnly);

  // Actions that should only appear in the overflow menu
  const menuOnlyActions = visibleActions.filter((action) => action.menuOnly);

  const doMeasure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const measureLayer = container.querySelector('[data-measure-layer="true"]');
    if (!measureLayer) return;

    const containerWidth = Math.floor(container.getBoundingClientRect().width);

    // If we must show the overflow button (menu-only actions), reserve its space
    const overflowMustShow = menuOnlyActions.length > 0;
    const fullFitWidth = overflowMustShow
      ? containerWidth - OVERFLOW_BUTTON_WIDTH - gap
      : containerWidth;

    // For responsive mode, decide whether labels fit by measuring the label layer.
    // We avoid oscillation by only switching modes when the decision is clear.
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
          total += Math.ceil(el.getBoundingClientRect().width) + gap;
        }
        return total;
      };

      const totalLabels = measureTotal(labelButtons);
      const totalIcons = measureTotal(iconButtons);

      const labelsFit = totalLabels <= fullFitWidth + MEASURE_EPSILON_PX;
      const iconsFit = totalIcons <= fullFitWidth + MEASURE_EPSILON_PX;

      if (labelsFit && effectiveMode !== 'with-labels') setEffectiveMode('with-labels');
      if (!labelsFit && iconsFit && effectiveMode !== 'icon-only') setEffectiveMode('icon-only');
      if (!labelsFit && !iconsFit && effectiveMode !== 'icon-only') setEffectiveMode('icon-only');
    }

    const modeKey = effectiveMode === 'with-labels' ? 'labels' : 'icons';
    const itemButtons = Array.from(
      measureLayer.querySelectorAll(`[data-measure="${modeKey}"]`)
    ) as HTMLElement[];
    if (itemButtons.length === 0) return;

    const itemWidths = itemButtons.map((el) => Math.ceil(el.getBoundingClientRect().width));

    let totalWidth = 0;
    for (const width of itemWidths) totalWidth += width + gap;

    if (totalWidth <= fullFitWidth + MEASURE_EPSILON_PX) {
      setVisibleCount((prev) => (prev === Infinity ? prev : Infinity));
      return;
    }

    const availableWidth = containerWidth - OVERFLOW_BUTTON_WIDTH - gap;
    let usedWidth = 0;
    let count = 0;

    for (const width of itemWidths) {
      const w = width + gap;
      if (usedWidth + w > availableWidth && count > 0) break;
      usedWidth += w;
      count++;
    }

    setVisibleCount((prev) => (prev === count ? prev : count));
  }, [displayMode, effectiveMode, gap, menuOnlyActions.length]);

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
  const inlineActions = visibleCount === Infinity
    ? inlineCandidates
    : inlineCandidates.slice(0, visibleCount);
  const overflowActions = visibleCount === Infinity
    ? []
    : inlineCandidates.slice(visibleCount);
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
  // Custom render takes precedence
  if (action.customRender) {
    return <>{action.customRender()}</>;
  }

  const Icon = action.loading && action.loadingIcon ? action.loadingIcon : action.icon;
  const isLink = !!action.href;
  
  const buttonContent = (
    <>
      <Icon className={cn('h-4 w-4', action.loading && 'animate-spin')} />
      {showLabel && <span className="truncate">{action.label}</span>}
      {action.badge !== undefined && (
        <span className={cn(
          'text-xs font-medium px-1.5 py-0.5 rounded-full ml-1',
          action.variant === 'warning' 
            ? 'bg-orange-500 text-white' 
            : action.variant === 'destructive'
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-muted text-muted-foreground'
        )}>
          {action.badge}
        </span>
      )}
    </>
  );

  const buttonClasses = cn(
    buttonHeight,
    showLabel ? 'px-2 gap-1.5' : 'w-8 p-0',
    'shrink-0',
    action.variant === 'warning' && 'text-orange-500 hover:text-orange-600',
    action.variant === 'destructive' && 'text-destructive hover:text-destructive',
    action.active && 'bg-secondary'
  );

  if (isLink) {
    return (
      <Button
        variant={action.active ? 'secondary' : 'ghost'}
        size={buttonSize}
        asChild
        className={buttonClasses}
        title={action.title || action.label}
      >
        <a href={action.href}>
          {buttonContent}
        </a>
      </Button>
    );
  }

  return (
    <Button
      variant={action.active ? 'secondary' : 'ghost'}
      size={buttonSize}
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
      className={buttonClasses}
      title={action.title || action.label}
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
  // Custom menu render takes precedence
  if (action.customMenuRender) {
    return (
      <>
        {action.separatorBefore && !isFirst && <DropdownMenuSeparator />}
        {action.customMenuRender()}
        {action.separatorAfter && <DropdownMenuSeparator />}
      </>
    );
  }

  const Icon = action.loading && action.loadingIcon ? action.loadingIcon : action.icon;
  const isLink = !!action.href;

  const itemContent = (
    <>
      <Icon className={cn('h-4 w-4 mr-2', action.loading && 'animate-spin')} />
      <span className="flex-1">{action.label}</span>
      {action.badge !== undefined && (
        <span className={cn(
          'text-xs font-medium px-1.5 py-0.5 rounded-full ml-auto',
          action.variant === 'warning' 
            ? 'bg-orange-500 text-white' 
            : action.variant === 'destructive'
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-muted text-muted-foreground'
        )}>
          {action.badge}
        </span>
      )}
      {action.active && (
        <span className="ml-auto text-xs text-muted-foreground">✓</span>
      )}
    </>
  );

  const itemClasses = cn(
    'flex items-center gap-2 cursor-pointer',
    action.variant === 'warning' && 'text-orange-500 focus:text-orange-600',
    action.variant === 'destructive' && 'text-destructive focus:text-destructive'
  );

  return (
    <>
      {action.separatorBefore && !isFirst && <DropdownMenuSeparator />}
      {isLink ? (
        <DropdownMenuItem asChild disabled={action.disabled || false}>
          <a href={action.href} className={itemClasses}>
            {itemContent}
          </a>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem 
          onClick={action.onClick}
          disabled={action.disabled || action.loading || false}
          className={itemClasses}
        >
          {itemContent}
        </DropdownMenuItem>
      )}
      {action.separatorAfter && <DropdownMenuSeparator />}
    </>
  );
}
