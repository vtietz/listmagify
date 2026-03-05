import { Button } from '@/components/ui/button';
import { OverflowTriggerButton } from './OverflowTriggerButton';
import type { AdaptiveNavProps, NavItem } from './types';

type MeasureLayerProps = {
  inlineItems: NavItem[];
  displayMode: AdaptiveNavProps['displayMode'];
};

export function MeasureLayer({ inlineItems, displayMode }: MeasureLayerProps) {
  return (
    <div
      className="absolute invisible pointer-events-none flex items-center gap-0.5 w-max top-0 left-0"
      aria-hidden="true"
      data-measure-layer="true"
    >
      <OverflowTriggerButton measure className="h-7 px-1.5 shrink-0" />

      {inlineItems.map((item) => (
        <Button
          key={`measure-icons-${item.id}`}
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 gap-1 shrink-0"
          data-measure="icons"
          tabIndex={-1}
        >
          {item.icon}
          {item.badge}
        </Button>
      ))}

      {displayMode === 'responsive' &&
        inlineItems.map((item) => (
          <Button
            key={`measure-labels-${item.id}`}
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 gap-1 shrink-0"
            data-measure="labels"
            tabIndex={-1}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </Button>
        ))}
    </div>
  );
}
