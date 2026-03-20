'use client';

import { Button } from '@/components/ui/button';
import type { SearchFilterType } from '@/lib/music-provider/types';

const FILTERS: { value: SearchFilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'tracks', label: 'Tracks' },
  { value: 'artists', label: 'Artists' },
  { value: 'albums', label: 'Albums' },
];

interface SearchFilterToggleProps {
  activeFilter: SearchFilterType;
  onFilterChange: (filter: SearchFilterType) => void;
}

export function SearchFilterToggle({ activeFilter, onFilterChange }: SearchFilterToggleProps) {
  return (
    <div className="px-3 py-1.5 border-b border-border flex gap-1">
      {FILTERS.map(({ value, label }) => (
        <Button
          key={value}
          variant={activeFilter === value ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs px-3"
          onClick={() => onFilterChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
