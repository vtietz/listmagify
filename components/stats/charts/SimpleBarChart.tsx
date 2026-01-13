import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DailySummary } from '../types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface SimpleBarChartProps {
  data: DailySummary[];
  label: string;
}

export function SimpleBarChart({ data, label }: SimpleBarChartProps) {
  const maxValue = Math.max(...data.map(d => d.total), 1);
  
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, _i) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors cursor-default"
                style={{ height: `${(d.total / maxValue) * 100}%`, minHeight: '2px' }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div>{d.total} events</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
    </div>
  );
}
