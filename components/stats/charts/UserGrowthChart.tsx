'use client';

import { formatDate } from '../utils';
import type { RegisteredUsersPerDay } from '../types';

interface UserGrowthChartProps {
  data: RegisteredUsersPerDay[];
}

export function UserGrowthChart({ data }: UserGrowthChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  const maxCumulative = Math.max(...data.map(d => d.cumulativeUsers), 1);

  return (
    <div className="space-y-2">
      <div className="h-32 relative">
        <svg className="w-full h-full" preserveAspectRatio="none">
          <polyline
            points={data.map((d, i) => {
              const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
              const y = 100 - (d.cumulativeUsers / maxCumulative) * 100;
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-blue-500"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={data.map((d, i) => {
              const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 50;
              const y = 100 - (d.cumulativeUsers / maxCumulative) * 100;
              return `${x},${y}`;
            }).join(' ') + ` 100,100 0,100`}
            fill="currentColor"
            className="text-blue-500/20"
          />
        </svg>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <div className="flex flex-col items-start">
          <span className="text-foreground font-medium">{data[0]?.cumulativeUsers ?? 0}</span>
          <span>{formatDate(data[0]?.date ?? '')}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-foreground font-medium">{data.at(-1)?.cumulativeUsers ?? 0}</span>
          <span>{formatDate(data.at(-1)?.date ?? '')}</span>
        </div>
      </div>
    </div>
  );
}
