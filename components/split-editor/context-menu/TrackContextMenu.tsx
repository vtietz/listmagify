'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { useDeviceType } from '@shared/hooks/useDeviceType';
import { BottomSheet } from '@/components/ui/BottomSheet';

import type { TrackContextMenuProps, MenuContentProps } from './types';
import { MenuContent } from './MenuContent';
import { phonePrimitives, tabletPrimitives } from './MenuPrimitives';
import { useContextMenuPosition } from './useContextMenuPosition';

function buildMenuTitle(
  track: { name: string; artists: string[] },
  isMultiSelect: boolean,
  selectedCount: number,
): string {
  const artistsText = track.artists.join(', ');
  const baseTitle = artistsText ? `${track.name} - ${artistsText}` : track.name;

  if (isMultiSelect && selectedCount > 1) {
    return `${baseTitle} +${selectedCount - 1}`;
  }

  return baseTitle;
}

function useMenuTopMeasurement(
  isOpen: boolean,
  menuPosition: { top: number; left: number } | null,
  menuRef: React.RefObject<HTMLDivElement | null>,
): number | null {
  const [measuredTop, setMeasuredTop] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    if (!isOpen || !menuPosition || !menuRef.current) {
      setMeasuredTop(null);
      return;
    }

    const padding = 8;
    const viewportHeight = window.innerHeight;
    const menuHeight = menuRef.current.getBoundingClientRect().height;
    const maxTop = Math.max(padding, viewportHeight - menuHeight - padding);
    setMeasuredTop(Math.min(menuPosition.top, maxTop));
  }, [isOpen, menuPosition, menuRef]);

  return measuredTop;
}

interface DesktopPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuPosition: { top: number; left: number };
  measuredTop: number | null;
  menuProps: MenuContentProps;
}

function DesktopPopover({
  isOpen,
  onClose,
  menuRef,
  menuPosition,
  measuredTop,
  menuProps,
}: DesktopPopoverProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9998]"
          onClick={onClose}
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        />
      )}
      <div
        ref={menuRef}
        className={cn(
          'fixed z-[9999] bg-popover border border-border rounded-md shadow-lg min-w-[180px]',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{
          left: menuPosition.left,
          top: measuredTop ?? menuPosition.top,
          maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto',
        }}
      >
        <MenuContent {...menuProps} primitives={tabletPrimitives} showTitleHeader />
      </div>
    </>
  );
}

export function TrackContextMenu({
  track,
  isOpen,
  onClose,
  position,
  reorderActions,
  markerActions,
  trackActions,
  recActions,
  pendingActions,
  isMultiSelect = false,
  selectedCount = 1,
  isEditable = false,
}: TrackContextMenuProps) {
  const { isPhone } = useDeviceType();
  const { mounted, menuPosition } = useContextMenuPosition(position);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const measuredTop = useMenuTopMeasurement(isOpen, menuPosition, menuRef);

  const title = buildMenuTitle(track, isMultiSelect, selectedCount);

  const withClose = React.useCallback((action?: () => void) => {
    return () => {
      action?.();
      onClose();
    };
  }, [onClose]);

  const menuProps = {
    title,
    withClose,
    reorderActions,
    markerActions,
    trackActions,
    recActions,
    pendingActions,
    isMultiSelect,
    selectedCount,
    isEditable,
  };

  if (isPhone) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
        <MenuContent {...menuProps} primitives={phonePrimitives} />
      </BottomSheet>
    );
  }

  if (!mounted || !menuPosition) {
    return null;
  }

  return createPortal(
    <DesktopPopover
      isOpen={isOpen}
      onClose={onClose}
      menuRef={menuRef}
      menuPosition={menuPosition}
      measuredTop={measuredTop}
      menuProps={menuProps}
    />,
    document.body,
  );
}
