import type { ActionDistribution } from '../types';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface ActionDonutProps {
  data: ActionDistribution[];
}

export function ActionDonut({ data }: ActionDonutProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const colors = ['bg-green-500', 'bg-red-500', 'bg-blue-500'];
  const labels: Record<string, string> = {
    track_add: 'Added',
    track_remove: 'Removed',
    track_reorder: 'Reordered',
  };
  
  if (total === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No actions recorded
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.event} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded ${colors[i % colors.length]}`} />
          <span className="flex-1 text-sm">{labels[d.event] || d.event}</span>
          <span className="text-sm font-medium">{d.count}</span>
          <span className="text-xs text-muted-foreground">
            ({formatPercent(d.count / total)})
          </span>
        </div>
      ))}
    </div>
  );
}
