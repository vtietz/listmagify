/**
 * Recursive component for rendering split tree nodes.
 * - GroupNode: renders a grid container with children
 * - PanelNode: renders a PlaylistPanel
 * 
 * Includes responsive behavior for phones and tablets:
 * - Phone: max 2 panels, focus-based sizing (65%/35%)
 * - Tablet: user-configurable panels with orientation-aware layout
 */

'use client';

import type { SplitNode } from '@/hooks/useSplitGridStore';
import { PlaylistPanel } from './PlaylistPanel';
import type { Track } from '@/lib/spotify/types';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useDeviceType } from '@/hooks/useDeviceType';
import { usePanelFocusStore, getFocusedPanelSize, getUnfocusedPanelSize } from '@/hooks/usePanelFocusStore';
import { cn } from '@/lib/utils';

interface SplitNodeViewProps {
  node: SplitNode;
  onRegisterVirtualizer:
    | ((
        panelId: string,
        virtualizer: Virtualizer<HTMLDivElement, Element>,
        scrollRef: { current: HTMLDivElement | null },
        filteredTracks: Track[],
        canDrop: boolean
      ) => void)
    | undefined;
  onUnregisterVirtualizer: ((panelId: string) => void) | undefined;
  activePanelId: string | null;
  sourcePanelId: string | null;
  dropIndicatorIndex: number | null;
  ephemeralInsertion: {
    activeId: string;
    sourcePanelId: string;
    targetPanelId: string;
    insertionIndex: number;
  } | null;
  /** Whether this is the root node (for responsive layout application) */
  isRoot?: boolean;
  /** Mobile: only show the first panel */
  mobileShowOnlyFirst?: boolean;
  /** Mobile: only show the second panel */
  mobileShowOnlySecond?: boolean;
}

export function SplitNodeView({
  node,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
  activePanelId,
  sourcePanelId,
  dropIndicatorIndex,
  ephemeralInsertion,
  isRoot = false,
  mobileShowOnlyFirst = false,
  mobileShowOnlySecond = false,
}: SplitNodeViewProps) {
  const { isPhone, isTablet, orientation, deviceType } = useDeviceType();
  const { focusedPanelId, focusPanel } = usePanelFocusStore();

  if (node.kind === 'panel') {
    // Determine if this panel is focused (for phone layout)
    const isFocused = focusedPanelId === node.panel.id;
    
    // When showing only one panel (mobile overlay mode), don't apply focus-based sizing
    // The panel should fill its container completely
    const isSinglePanelMode = mobileShowOnlyFirst || mobileShowOnlySecond;
    
    // Phone-specific: calculate flex basis based on focus (only when multiple panels visible)
    const phoneFlexStyle = isPhone && !isSinglePanelMode ? {
      flexBasis: isFocused ? getFocusedPanelSize() : getUnfocusedPanelSize(),
      flexGrow: 0,
      flexShrink: 0,
    } : {};

    // Handle panel header tap for focus (phones only)
    const handlePanelFocus = () => {
      if (isPhone) {
        focusPanel(node.panel.id);
      }
    };

    return (
      <div 
        className={cn(
          'min-h-0 min-w-0 h-full transition-all duration-200',
          isPhone && !isSinglePanelMode && 'cursor-pointer',
          isPhone && !isSinglePanelMode && isFocused && 'panel-focused',
          isPhone && !isSinglePanelMode && !isFocused && 'panel-unfocused'
        )}
        style={phoneFlexStyle}
        onClick={!isFocused && isPhone && !isSinglePanelMode ? handlePanelFocus : undefined}
      >
        <PlaylistPanel
          panelId={node.panel.id}
          onRegisterVirtualizer={onRegisterVirtualizer}
          onUnregisterVirtualizer={onUnregisterVirtualizer}
          isActiveDropTarget={activePanelId === node.panel.id}
          isDragSource={sourcePanelId === node.panel.id}
          dropIndicatorIndex={
            // Only show drop indicator in the panel being hovered (target), not in source panel
            activePanelId === node.panel.id ? dropIndicatorIndex : null
          }
          ephemeralInsertion={ephemeralInsertion}
        />
      </div>
    );
  }

  // Group node - render container with children
  // Responsive orientation: phones and tablets follow screen orientation
  const effectiveOrientation = (isPhone || isTablet)
    ? (orientation === 'portrait' ? 'vertical' : 'horizontal')
    : node.orientation;
  
  const isHorizontal = effectiveOrientation === 'horizontal';
  
  // Phone: limit to 2 panels, or filter based on mobile props
  let visibleChildren = isPhone 
    ? node.children.slice(0, 2) 
    : node.children;
  
  // Mobile overlay filtering: show only first or second panel
  if (isPhone && mobileShowOnlyFirst && visibleChildren.length > 0) {
    visibleChildren = [visibleChildren[0]!];
  } else if (isPhone && mobileShowOnlySecond && visibleChildren.length > 1) {
    visibleChildren = [visibleChildren[1]!];
  }
  
  // When showing only one panel, pass the flag down for proper sizing
  const isSinglePanelMode = mobileShowOnlyFirst || mobileShowOnlySecond;

  // Use flexbox for phone (for focus-based sizing), grid for others
  if (isPhone) {
    return (
      <div
        className={cn(
          'h-full w-full min-h-0 min-w-0 flex gap-2 split-container',
          isHorizontal ? 'flex-row' : 'flex-col'
        )}
        data-device={deviceType}
        data-orientation={orientation}
      >
        {visibleChildren.map((child) => (
          <SplitNodeView
            key={child.kind === 'panel' ? child.panel.id : child.id}
            node={child}
            onRegisterVirtualizer={onRegisterVirtualizer}
            onUnregisterVirtualizer={onUnregisterVirtualizer}
            activePanelId={activePanelId}
            sourcePanelId={sourcePanelId}
            dropIndicatorIndex={dropIndicatorIndex}
            ephemeralInsertion={ephemeralInsertion}
            mobileShowOnlyFirst={mobileShowOnlyFirst}
            mobileShowOnlySecond={mobileShowOnlySecond}
          />
        ))}
      </div>
    );
  }
  
  // Tablet and Desktop: use CSS Grid
  return (
    <div
      className={cn(
        'h-full w-full min-h-0 min-w-0 split-container',
        isRoot && `device-${deviceType} orientation-${orientation}`
      )}
      style={{
        display: 'grid',
        // horizontal = side by side (columns), vertical = stacked (rows)
        gridTemplateColumns: isHorizontal
          ? `repeat(${visibleChildren.length}, 1fr)`
          : '1fr',
        gridTemplateRows: isHorizontal
          ? '1fr'
          : `repeat(${visibleChildren.length}, 1fr)`,
        gap: '0.5rem',
      }}
      data-device={deviceType}
      data-orientation={orientation}
    >
      {visibleChildren.map((child) => (
        <SplitNodeView
          key={child.kind === 'panel' ? child.panel.id : child.id}
          node={child}
          onRegisterVirtualizer={onRegisterVirtualizer}
          onUnregisterVirtualizer={onUnregisterVirtualizer}
          activePanelId={activePanelId}
          sourcePanelId={sourcePanelId}
          dropIndicatorIndex={dropIndicatorIndex}
          ephemeralInsertion={ephemeralInsertion}
        />
      ))}
    </div>
  );
}
