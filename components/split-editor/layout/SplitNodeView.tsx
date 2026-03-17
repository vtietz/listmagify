'use client';

import type { SplitNode } from '@/hooks/useSplitGridStore';
import { PlaylistPanel } from '../playlist/PlaylistPanel';
import type { Track } from '@/lib/music-provider/types';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Layout } from 'react-resizable-panels';
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
  /** Whether this is the root node (for responsive layout application) */
  isRoot?: boolean;
  /** Mobile: only show the first panel */
  mobileShowOnlyFirst?: boolean;
  /** Mobile: only show the second panel */
  mobileShowOnlySecond?: boolean;
}

type VirtualizerRegister = SplitNodeViewProps['onRegisterVirtualizer'];
type VirtualizerUnregister = SplitNodeViewProps['onUnregisterVirtualizer'];

function PanelNodeView({
  node,
  isPhone,
  isSinglePanelMode,
  focusedPanelId,
  focusPanel,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
}: {
  node: Extract<SplitNode, { kind: 'panel' }>;
  isPhone: boolean;
  isSinglePanelMode: boolean;
  focusedPanelId: string | null;
  focusPanel: (id: string) => void;
  onRegisterVirtualizer: VirtualizerRegister;
  onUnregisterVirtualizer: VirtualizerUnregister;
}) {
  const isFocused = focusedPanelId === node.panel.id;

  const phoneFlexStyle = isPhone && !isSinglePanelMode ? {
    flexBasis: isFocused ? getFocusedPanelSize() : getUnfocusedPanelSize(),
    flexGrow: 0,
    flexShrink: 0,
  } : {};

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
      />
    </div>
  );
}

function PhoneGroupView({
  isHorizontal,
  visibleChildren,
  deviceType,
  orientation,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
  mobileShowOnlyFirst,
  mobileShowOnlySecond,
}: {
  isHorizontal: boolean;
  visibleChildren: SplitNode[];
  deviceType: string;
  orientation: string;
  onRegisterVirtualizer: VirtualizerRegister;
  onUnregisterVirtualizer: VirtualizerUnregister;
  mobileShowOnlyFirst: boolean;
  mobileShowOnlySecond: boolean;
}) {
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
          mobileShowOnlyFirst={mobileShowOnlyFirst}
          mobileShowOnlySecond={mobileShowOnlySecond}
        />
      ))}
    </div>
  );
}

function ResizableGroupView({
  isHorizontal,
  storageKey,
  isRoot,
  deviceType,
  orientation,
  defaultLayout,
  onLayoutChange,
  visibleChildren,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
}: {
  isHorizontal: boolean;
  storageKey: string;
  isRoot: boolean;
  deviceType: string;
  orientation: string;
  defaultLayout: Layout | undefined;
  onLayoutChange: (layout: Layout) => void | undefined;
  visibleChildren: SplitNode[];
  onRegisterVirtualizer: VirtualizerRegister;
  onUnregisterVirtualizer: VirtualizerUnregister;
}) {
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

export function SplitNodeView({
  node,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
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
    const isSinglePanelMode = mobileShowOnlyFirst || mobileShowOnlySecond;
    return (
      <PanelNodeView
        node={node}
        isPhone={isPhone}
        isSinglePanelMode={isSinglePanelMode}
        focusedPanelId={focusedPanelId}
        focusPanel={focusPanel}
        onRegisterVirtualizer={onRegisterVirtualizer}
        onUnregisterVirtualizer={onUnregisterVirtualizer}
      />
    );
  }

  // Group node - render container with children
  const effectiveOrientation = (isPhone || isTablet)
    ? (orientation === 'portrait' ? 'vertical' : 'horizontal')
    : node.orientation;

  const isHorizontal = effectiveOrientation === 'horizontal';

  let visibleChildren = isPhone
    ? node.children.slice(0, 2)
    : node.children;

  if (isPhone && mobileShowOnlyFirst && visibleChildren.length > 0) {
    visibleChildren = [visibleChildren[0]!];
  } else if (isPhone && mobileShowOnlySecond && visibleChildren.length > 1) {
    visibleChildren = [visibleChildren[1]!];
  }

  if (isPhone) {
    return (
      <PhoneGroupView
        isHorizontal={isHorizontal}
        visibleChildren={visibleChildren}
        deviceType={deviceType}
        orientation={orientation}
        onRegisterVirtualizer={onRegisterVirtualizer}
        onUnregisterVirtualizer={onUnregisterVirtualizer}
        mobileShowOnlyFirst={mobileShowOnlyFirst}
        mobileShowOnlySecond={mobileShowOnlySecond}
      />
    );
  }

  return (
    <ResizableGroupView
      isHorizontal={isHorizontal}
      storageKey={storageKey}
      isRoot={isRoot}
      deviceType={deviceType}
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChange={onLayoutChange}
      visibleChildren={visibleChildren}
      onRegisterVirtualizer={onRegisterVirtualizer}
      onUnregisterVirtualizer={onUnregisterVirtualizer}
    />
  );
}

