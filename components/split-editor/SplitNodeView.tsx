/**
 * Recursive component for rendering split tree nodes.
 * - GroupNode: renders a resizable container with children
 * - PanelNode: renders a PlaylistPanel
 * 
 * Includes responsive behavior for phones and tablets:
 * - Phone: max 2 panels, focus-based sizing (65%/35%), no resizing
 * - Tablet/Desktop: resizable panels with drag handles and localStorage persistence
 */

'use client';

import type { SplitNode } from '@/hooks/useSplitGridStore';
import { PlaylistPanel } from './PlaylistPanel';
import type { Track } from '@/lib/spotify/types';
import type { Virtualizer } from '@tanstack/react-virtual';
import { useDeviceType } from '@/hooks/useDeviceType';
import { usePanelFocusStore, getFocusedPanelSize, getUnfocusedPanelSize } from '@/hooks/usePanelFocusStore';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, useDefaultLayout } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

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

  // Pre-compute values for useDefaultLayout hook (must be called unconditionally)
  const isGroupNode = node.kind === 'group';
  const storageKey = isGroupNode ? `split-${node.id}` : '';
  const panelIds = isGroupNode 
    ? (isPhone ? node.children.slice(0, 2) : node.children).map((child) => 
        child.kind === 'panel' ? child.panel.id : child.id
      )
    : [];
  
  // Use localStorage to persist panel sizes (must be called unconditionally per Rules of Hooks)
  const storageConfig = typeof window !== 'undefined' && isGroupNode && !isPhone
    ? { storage: localStorage }
    : {};
  
  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    id: storageKey || 'default',
    panelIds,
    ...storageConfig,
  });

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
  
  // Tablet and Desktop: use react-resizable-panels for drag-to-resize functionality
  // (panelIds and storage already computed at top for Rules of Hooks compliance)
  
  return (
    <PanelGroup
      id={storageKey}
      orientation={isHorizontal ? 'horizontal' : 'vertical'}
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
      className={cn(
        'h-full w-full min-h-0 min-w-0 split-container',
        isRoot && `device-${deviceType} orientation-${orientation}`
      )}
      data-device={deviceType}
      data-orientation={orientation}
    >
      {visibleChildren.map((child, index) => (
        <Fragment key={child.kind === 'panel' ? child.panel.id : child.id}>
          <Panel
            id={child.kind === 'panel' ? child.panel.id : child.id}
            defaultSize={100 / visibleChildren.length}
            minSize={10}
            className="min-h-0 min-w-0"
          >
            <SplitNodeView
              node={child}
              onRegisterVirtualizer={onRegisterVirtualizer}
              onUnregisterVirtualizer={onUnregisterVirtualizer}
              activePanelId={activePanelId}
              sourcePanelId={sourcePanelId}
              dropIndicatorIndex={dropIndicatorIndex}
              ephemeralInsertion={ephemeralInsertion}
            />
          </Panel>
          {index < visibleChildren.length - 1 && (
            <PanelResizeHandle className={cn(
              'group/handle relative flex items-center justify-center',
              'bg-border hover:bg-primary/20 active:bg-primary/30 transition-colors',
              isHorizontal ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
            )}>
              <div className={cn(
                'absolute bg-primary/0 group-hover/handle:bg-primary/50 transition-colors rounded-full',
                isHorizontal ? 'w-1 h-10' : 'h-1 w-10'
              )} />
            </PanelResizeHandle>
          )}
        </Fragment>
      ))}
    </PanelGroup>
  );
}
