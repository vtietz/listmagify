'use client';

import type { SplitNode } from '@features/split-editor/stores/useSplitGridStore';
import { PlaylistPanel } from '../playlist/PlaylistPanel';
import { ProviderPanelGuard } from '@/components/auth/ProviderPanelGuard';
import type { Track } from '@/lib/music-provider/types';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { Layout } from 'react-resizable-panels';
import { useDeviceType } from '@shared/hooks/useDeviceType';
import { usePanelFocusStore, getFocusedPanelSize, getUnfocusedPanelSize } from '@features/split-editor/browse/hooks/usePanelFocusStore';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, useDefaultLayout } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';
import type { CSSProperties } from 'react';

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

type GroupNode = Extract<SplitNode, { kind: 'group' }>;

function getPanelNodeContainerClassName({
  isPhone,
  isSinglePanelMode,
  isFocused,
}: {
  isPhone: boolean;
  isSinglePanelMode: boolean;
  isFocused: boolean;
}) {
  return cn(
    'min-h-0 min-w-0 h-full transition-all duration-200',
    isPhone && !isSinglePanelMode && 'cursor-pointer',
    isPhone && !isSinglePanelMode && isFocused && 'panel-focused',
    isPhone && !isSinglePanelMode && !isFocused && 'panel-unfocused'
  );
}

function getPanelNodeStyle({
  isPhone,
  isSinglePanelMode,
  isFocused,
}: {
  isPhone: boolean;
  isSinglePanelMode: boolean;
  isFocused: boolean;
}): CSSProperties | undefined {
  if (!isPhone || isSinglePanelMode) {
    return undefined;
  }

  return {
    flexBasis: isFocused ? getFocusedPanelSize() : getUnfocusedPanelSize(),
    flexGrow: 0,
    flexShrink: 0,
  };
}

function getPanelNodeClickHandler({
  isFocused,
  isPhone,
  isSinglePanelMode,
  focusPanel,
  panelId,
}: {
  isFocused: boolean;
  isPhone: boolean;
  isSinglePanelMode: boolean;
  focusPanel: (id: string) => void;
  panelId: string;
}) {
  if (isFocused || !isPhone || isSinglePanelMode) {
    return undefined;
  }

  return () => {
    focusPanel(panelId);
  };
}

function getStorageKeyAndPanelIds({
  groupNode,
  isPhone,
}: {
  groupNode: GroupNode | null;
  isPhone: boolean;
}) {
  if (!groupNode) {
    return { storageKey: '', panelIds: [] as string[] };
  }

  const visibleForLayout = isPhone ? groupNode.children.slice(0, 2) : groupNode.children;
  const panelIds = visibleForLayout.map((child) =>
    child.kind === 'panel' ? child.panel.id : child.id
  );

  return {
    storageKey: `split-${groupNode.id}`,
    panelIds,
  };
}

function getStorageConfig({
  groupNode,
  isPhone,
}: {
  groupNode: GroupNode | null;
  isPhone: boolean;
}) {
  if (typeof window !== 'undefined' && groupNode && !isPhone) {
    return { storage: localStorage };
  }

  return {};
}

function resolveEffectiveOrientation({
  isPhone,
  isTablet,
  orientation,
  nodeOrientation,
}: {
  isPhone: boolean;
  isTablet: boolean;
  orientation: string;
  nodeOrientation: 'horizontal' | 'vertical';
}) {
  if (isPhone || isTablet) {
    return orientation === 'portrait' ? 'vertical' : 'horizontal';
  }

  return nodeOrientation;
}

function getVisibleChildren({
  children,
  isPhone,
  mobileShowOnlyFirst,
  mobileShowOnlySecond,
}: {
  children: SplitNode[];
  isPhone: boolean;
  mobileShowOnlyFirst: boolean;
  mobileShowOnlySecond: boolean;
}) {
  if (!isPhone) {
    return children;
  }

  const initialChildren = children.slice(0, 2);
  if (mobileShowOnlyFirst) {
    return initialChildren.length > 0 ? [initialChildren[0]!] : [];
  }

  if (mobileShowOnlySecond) {
    return initialChildren.length > 1 ? [initialChildren[1]!] : [];
  }

  return initialChildren;
}

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
  const phoneFlexStyle = getPanelNodeStyle({ isPhone, isSinglePanelMode, isFocused });
  const className = getPanelNodeContainerClassName({ isPhone, isSinglePanelMode, isFocused });
  const onClick = getPanelNodeClickHandler({
    isFocused,
    isPhone,
    isSinglePanelMode,
    focusPanel,
    panelId: node.panel.id,
  });

  return (
    <div
      className={className}
      style={phoneFlexStyle}
      onClick={onClick}
    >
      <ProviderPanelGuard provider={node.panel.providerId}>
        <PlaylistPanel
          panelId={node.panel.id}
          onRegisterVirtualizer={onRegisterVirtualizer}
          onUnregisterVirtualizer={onUnregisterVirtualizer}
        />
      </ProviderPanelGuard>
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
  const panelNode = node.kind === 'panel' ? node : null;
  const groupNode = node.kind === 'group' ? node : null;

  // Pre-compute values for useDefaultLayout hook (must be called unconditionally)
  const { storageKey, panelIds } = getStorageKeyAndPanelIds({ groupNode, isPhone });

  // Use localStorage to persist panel sizes (must be called unconditionally per Rules of Hooks)
  const storageConfig = getStorageConfig({ groupNode, isPhone });

  const { defaultLayout, onLayoutChange } = useDefaultLayout({
    id: storageKey || 'default',
    panelIds,
    ...storageConfig,
  });

  if (panelNode) {
    const isSinglePanelMode = mobileShowOnlyFirst || mobileShowOnlySecond;
    return (
      <PanelNodeView
        node={panelNode}
        isPhone={isPhone}
        isSinglePanelMode={isSinglePanelMode}
        focusedPanelId={focusedPanelId}
        focusPanel={focusPanel}
        onRegisterVirtualizer={onRegisterVirtualizer}
        onUnregisterVirtualizer={onUnregisterVirtualizer}
      />
    );
  }

  if (!groupNode) {
    return null;
  }

  // Group node - render container with children
  const effectiveOrientation = resolveEffectiveOrientation({
    isPhone,
    isTablet,
    orientation,
    nodeOrientation: groupNode.orientation,
  });

  const isHorizontal = effectiveOrientation === 'horizontal';
  const visibleChildren = getVisibleChildren({
    children: groupNode.children,
    isPhone,
    mobileShowOnlyFirst,
    mobileShowOnlySecond,
  });

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

