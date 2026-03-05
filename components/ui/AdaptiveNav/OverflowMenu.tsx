import { Fragment, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OverflowTriggerButton } from './OverflowTriggerButton';
import { shouldShowSeparator } from './utils';
import type { NavItem } from './types';

type OverflowMenuProps = {
  overflowItems: NavItem[];
  menuOnlyItems: NavItem[];
  dropdownHeader?: ReactNode;
  renderMenuItem: (item: NavItem) => ReactNode;
};

export function OverflowMenu({
  overflowItems,
  menuOnlyItems,
  dropdownHeader,
  renderMenuItem,
}: OverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <OverflowTriggerButton title="More options" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {dropdownHeader}
        {dropdownHeader && (overflowItems.length > 0 || menuOnlyItems.length > 0) && (
          <DropdownMenuSeparator />
        )}

        {menuOnlyItems.map((item, index) => {
          const previousItem = index > 0 ? menuOnlyItems[index - 1] ?? null : null;
          const showSeparator = shouldShowSeparator(previousItem, item);

          return (
            <Fragment key={item.id}>
              {showSeparator && <DropdownMenuSeparator />}
              {renderMenuItem(item)}
            </Fragment>
          );
        })}

        {menuOnlyItems.length > 0 && overflowItems.length > 0 && <DropdownMenuSeparator />}

        {overflowItems.map((item, index) => {
          const previousItem =
            index > 0
              ? (overflowItems[index - 1] ?? null)
              : (menuOnlyItems[menuOnlyItems.length - 1] ?? null);
          const showSeparator = shouldShowSeparator(previousItem, item);

          return (
            <Fragment key={item.id}>
              {showSeparator && <DropdownMenuSeparator />}
              {renderMenuItem(item)}
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
