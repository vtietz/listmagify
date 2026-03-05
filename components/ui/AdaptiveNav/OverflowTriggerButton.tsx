import { forwardRef, type ComponentProps } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

type OverflowTriggerButtonProps = ComponentProps<typeof Button> & {
  title?: string;
  measure?: boolean;
};

export const OverflowTriggerButton = forwardRef<HTMLButtonElement, OverflowTriggerButtonProps>(
  ({ title, className, measure = false, ...buttonProps }, ref) => {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="sm"
        className={className ?? 'h-7 px-1.5 shrink-0'}
        title={title}
        data-measure-overflow-button={measure ? 'true' : undefined}
        tabIndex={measure ? -1 : undefined}
        {...buttonProps}
      >
        <MoreHorizontal className="h-4 w-4" />
        {!measure && <span className="sr-only">More</span>}
      </Button>
    );
  }
);

OverflowTriggerButton.displayName = 'OverflowTriggerButton';
