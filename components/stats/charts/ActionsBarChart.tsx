import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DailyActions } from '../types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ActionsBarChartProps {
  data: DailyActions[];
}

export function ActionsBarChart({ data }: ActionsBarChartProps) {
  const maxValue = Math.max(...data.map(d => d.actions), 1);
  
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        No data for selected period
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 rounded-t transition-colors cursor-default flex flex-col justify-end"
                style={{ height: `${(d.actions / maxValue) * 100}%`, minHeight: '2px' }}
              >
                {/* Stacked bar: adds (green), removes (red), reorders (blue) */}
                <div 
                  className="bg-green-500/80 hover:bg-green-500 w-full"
                  style={{ height: `${d.actions > 0 ? (d.adds / d.actions) * 100 : 0}%` }}
                />
                <div 
                  className="bg-red-500/80 hover:bg-red-500 w-full"
                  style={{ height: `${d.actions > 0 ? (d.removes / d.actions) * 100 : 0}%` }}
                />
                <div 
                  className="bg-blue-500/80 hover:bg-blue-500 w-full rounded-t"
                  style={{ height: `${d.actions > 0 ? (d.reorders / d.actions) * 100 : 0}%` }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm space-y-1">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded" />
                  <span>{d.adds} added</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded" />
                  <span>{d.removes} removed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded" />
                  <span>{d.reorders} reordered</span>
                </div>
                <div className="border-t pt-1 mt-1 font-medium">{d.actions} total</div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date ? formatDate(data[0].date) : ''}</span>
        <span>{data.at(-1)?.date ? formatDate(data.at(-1)!.date) : ''}</span>
      </div>
      {/* Legend */}
      <div className="flex gap-4 justify-center text-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded" />
          <span>Added</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-red-500 rounded" />
          <span>Removed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-500 rounded" />
          <span>Reordered</span>
        </div>
      </div>
    </div>
  );
}
