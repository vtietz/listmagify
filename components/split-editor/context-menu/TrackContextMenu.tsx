'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { useDeviceType } from '@/hooks/useDeviceType';
import { BottomSheet } from '@/components/ui/BottomSheet';

import type { TrackContextMenuProps } from './types';
import { MenuContent } from './MenuContent';
import { phonePrimitives, tabletPrimitives } from './MenuPrimitives';
import { useContextMenuPosition } from './useContextMenuPosition';

export function TrackContextMenu({
  track,
  isOpen,
  onClose,
  position,
  reorderActions,
  markerActions,
  trackActions,
  recActions,
  isMultiSelect = false,
  selectedCount = 1,
  isEditable = false,
}: TrackContextMenuProps) {
  const { isPhone } = useDeviceType();
  const { mounted, menuPosition } = useContextMenuPosition(position);

  // Title format: "Track Name" or "Track Name +N" for multi-select
  const title = isMultiSelect && selectedCount > 1
    ? `${track.name} +${selectedCount - 1}`
    : track.name;

  // Action wrapper that closes menu after action
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
    isMultiSelect,
    selectedCount,
    isEditable,
  };

  // Phone: Use BottomSheet
  if (isPhone) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
        <MenuContent {...menuProps} primitives={phonePrimitives} />
      </BottomSheet>
    );
  }

  // Don't render until mounted (SSR safety) or if no position
  if (!mounted || !menuPosition) {
    return null;
  }

  // Tablet and Desktop: Use Popover rendered via portal
  const popoverContent = (
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
        className={cn(
          'fixed z-[9999] bg-popover border border-border rounded-md shadow-lg min-w-[180px]',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{
          left: menuPosition.left,
          top: menuPosition.top,
          maxHeight: 'calc(100vh - 16px)',
          overflowY: 'auto',
        }}
      >
        <MenuContent {...menuProps} primitives={tabletPrimitives} showTitleHeader />
      </div>
    </>
  );

  return createPortal(popoverContent, document.body);
}
