'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { BottomSheetDivider, BottomSheetMenuItem, BottomSheetSection } from '@/components/ui/BottomSheet';

// Common interface for menu primitives
export interface MenuPrimitives {
  Section: React.ComponentType<{ title?: string; children: React.ReactNode }>;
  Item: React.ComponentType<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    destructive?: boolean;
  }>;
  Divider: React.ComponentType;
}

// Phone primitives (BottomSheet-based)
export const phonePrimitives: MenuPrimitives = {
  Section: BottomSheetSection,
  Item: BottomSheetMenuItem,
  Divider: BottomSheetDivider,
};

// Tablet/Desktop primitives (Popover-based)
function PopoverSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <>
      {title && (
        <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </div>
      )}
      {children}
    </>
  );
}

function PopoverItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent cursor-pointer',
        destructive && !disabled && 'text-destructive hover:bg-destructive/10'
      )}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <Icon className={cn('h-4 w-4', destructive && 'text-destructive')} />
      {label}
    </button>
  );
}

function PopoverDivider() {
  return <div className="h-px bg-border my-1" />;
}

export const tabletPrimitives: MenuPrimitives = {
  Section: PopoverSection,
  Item: PopoverItem,
  Divider: PopoverDivider,
};
