import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NavItem } from './types';

type InlineButtonProps = {
  item: NavItem;
  showLabel: boolean;
  isHidden: boolean;
};

type InlineButtonSharedProps = {
  item: NavItem;
  buttonClasses: string;
  buttonContent: React.ReactNode;
  title: string;
};

function InlineLinkButton({ item, buttonClasses, buttonContent, title }: InlineButtonSharedProps) {
  if (!item.href) {
    return null;
  }

  return (
    <Button
      variant={item.isActive ? 'secondary' : 'ghost'}
      size="sm"
      asChild
      className={buttonClasses}
      data-nav-item={item.id}
    >
      <Link href={item.href} title={title}>
        {buttonContent}
      </Link>
    </Button>
  );
}

function InlineActionButton({ item, buttonClasses, buttonContent, title }: InlineButtonSharedProps) {
  return (
    <Button
      variant={item.isActive ? 'secondary' : 'ghost'}
      size="sm"
      onClick={item.disabled ? undefined : item.onClick}
      disabled={item.disabled || item.loading}
      className={buttonClasses}
      data-nav-item={item.id}
      title={title}
    >
      {buttonContent}
    </Button>
  );
}

export function InlineButton({ item, showLabel, isHidden }: InlineButtonProps) {
  if (item.customRender) {
    return <div className={cn(isHidden && 'hidden')}>{item.customRender(item)}</div>;
  }

  const buttonContent = (
    <>
      <span className={cn(item.loading && '[&>svg]:animate-spin')}>{item.icon}</span>
      {showLabel && <span>{item.label}</span>}
      {item.badge}
    </>
  );

  const buttonClasses = cn(
    'h-7 px-1.5 gap-1 cursor-pointer shrink-0',
    isHidden && 'hidden',
    item.variant === 'warning' && 'text-orange-500 hover:text-orange-600',
    item.variant === 'destructive' && 'text-destructive hover:text-destructive'
  );
  const title = item.title || item.label;

  if (item.href) {
    return (
      <InlineLinkButton
        item={item}
        buttonClasses={buttonClasses}
        buttonContent={buttonContent}
        title={title}
      />
    );
  }

  return (
    <InlineActionButton
      item={item}
      buttonClasses={buttonClasses}
      buttonContent={buttonContent}
      title={title}
    />
  );
}
