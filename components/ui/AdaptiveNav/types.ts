import type { ReactNode } from 'react';

export interface NavItem {
  id: string;
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
  badge?: ReactNode;
  showCheckmark?: boolean;
  separator?: 'before' | 'after';
  hidden?: boolean;
  group?: string;
  visible?: boolean;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'warning' | 'destructive';
  title?: string;
  neverOverflow?: boolean;
  customRender?: (item: NavItem) => ReactNode;
  customMenuRender?: (item: NavItem) => ReactNode;
  menuOnly?: boolean;
}

export interface AdaptiveNavProps {
  items: NavItem[];
  displayMode?: 'icon-only' | 'with-labels' | 'responsive';
  layoutMode?: 'horizontal' | 'burger';
  burgerIcon?: ReactNode;
  dropdownHeader?: ReactNode;
  className?: string;
}

export type EffectiveDisplayMode = 'icon-only' | 'with-labels';
