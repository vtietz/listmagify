import { Fragment } from 'react';
import Link from 'next/link';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { NavItem } from './types';

type MenuItemProps = {
  item: NavItem;
};

function MenuContent({ item }: { item: NavItem }) {
  return (
    <>
      <span className={cn('[&>svg]:h-4 [&>svg]:w-4', item.loading && '[&>svg]:animate-spin')}>
        {item.icon}
      </span>
      <span
        className={cn(
          item.variant === 'warning' && 'text-orange-500',
          item.variant === 'destructive' && 'text-destructive'
        )}
      >
        {item.label}
      </span>
      {item.showCheckmark && item.isActive && (
        <span className="ml-auto text-xs text-muted-foreground">✓</span>
      )}
      {item.badge && !item.showCheckmark && <span className="ml-auto">{item.badge}</span>}
    </>
  );
}

function DefaultMenuItem({ item }: { item: NavItem }) {
  if (item.href) {
    return (
      <DropdownMenuItem asChild disabled={item.disabled ?? false}>
        <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
          <MenuContent item={item} />
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      onClick={item.disabled ? undefined : item.onClick}
      disabled={(item.disabled || item.loading) ?? false}
      className="flex items-center gap-2 cursor-pointer"
    >
      <MenuContent item={item} />
    </DropdownMenuItem>
  );
}

export function MenuItem({ item }: MenuItemProps) {
  if (item.customMenuRender) {
    return (
      <Fragment>
        {item.separator === 'before' && <DropdownMenuSeparator />}
        {item.customMenuRender(item)}
        {item.separator === 'after' && <DropdownMenuSeparator />}
      </Fragment>
    );
  }

  return (
    <Fragment>
      {item.separator === 'before' && <DropdownMenuSeparator />}
      <DefaultMenuItem item={item} />
      {item.separator === 'after' && <DropdownMenuSeparator />}
    </Fragment>
  );
}
