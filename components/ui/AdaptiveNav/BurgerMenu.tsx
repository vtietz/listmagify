import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { groupBy } from './utils';
import type { NavItem } from './types';

type BurgerMenuProps = {
  items: NavItem[];
  burgerIcon?: ReactNode;
  renderMenuItem: (item: NavItem) => ReactNode;
};

export function BurgerMenu({ items, burgerIcon, renderMenuItem }: BurgerMenuProps) {
  const groupedItems = groupBy(items, (item) => item.group || 'default');
  const groupKeys = Object.keys(groupedItems);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2">
          {burgerIcon || <MoreHorizontal className="h-4 w-4" />}
          <span className="sr-only">Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {groupKeys.map((groupKey, groupIndex) => {
          const groupItems = groupedItems[groupKey] ?? [];
          if (groupItems.length === 0) {
            return null;
          }

          return (
            <div key={groupKey}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              {groupItems.map((item) => (
                <div key={item.id}>{renderMenuItem(item)}</div>
              ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
