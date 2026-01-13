import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DailyUsers } from '../types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface UsersBarChartProps {
  data: DailyUsers[];
}

export function UsersBarChart({ data }: UsersBarChartProps) {
  const maxValue = Math.max(...data.map(d => d.users), 1);
  
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
                className="flex-1 bg-blue-500/80 rounded-t hover:bg-blue-500 transition-colors cursor-default"
                style={{ height: `${(d.users / maxValue) * 100}%`, minHeight: '2px' }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <div className="font-medium">{formatDate(d.date)}</div>
                <div>{d.users} unique user{d.users !== 1 ? 's' : ''}</div>
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
