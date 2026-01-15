/**
 * LastfmBrowseFilters - Header section with username input, source/period selectors
 */

import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddSelectedToMarkersButton } from './AddSelectedToMarkersButton';
import type { ImportSource, LastfmPeriod } from '@/lib/importers/types';

const SOURCE_OPTIONS: { value: ImportSource; label: string }[] = [
  { value: 'lastfm-recent', label: 'Recent' },
  { value: 'lastfm-loved', label: 'Loved' },
  { value: 'lastfm-top', label: 'Top' },
  { value: 'lastfm-weekly', label: 'Weekly' },
];

const PERIOD_OPTIONS: { value: LastfmPeriod; label: string }[] = [
  { value: '7day', label: '7d' },
  { value: '1month', label: '1mo' },
  { value: '3month', label: '3mo' },
  { value: '6month', label: '6mo' },
  { value: '12month', label: '1yr' },
  { value: 'overall', label: 'All' },
];

interface LastfmBrowseFiltersProps {
  localUsername: string;
  onUsernameChange: (value: string) => void;
  lastfmSource: ImportSource;
  onSourceChange: (source: ImportSource) => void;
  lastfmPeriod: LastfmPeriod;
  onPeriodChange: (period: LastfmPeriod) => void;
  hasAnyMarkers: boolean;
  selectedCount: number;
  getTrackUris: () => Promise<string[]>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function LastfmBrowseFilters({
  localUsername,
  onUsernameChange,
  lastfmSource,
  onSourceChange,
  lastfmPeriod,
  onPeriodChange,
  hasAnyMarkers,
  selectedCount,
  getTrackUris,
  inputRef,
}: LastfmBrowseFiltersProps) {
  return (
    <div className="px-3 py-2 border-b border-border">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Last.fm username..."
            value={localUsername}
            onChange={(e) => onUsernameChange(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
        
        {/* Source selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 text-xs w-[80px] justify-between shrink-0">
              {SOURCE_OPTIONS.find(opt => opt.value === lastfmSource)?.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[140px]">
            {SOURCE_OPTIONS.map((opt) => (
              <DropdownMenuItem 
                key={opt.value} 
                onClick={() => onSourceChange(opt.value)}
                className={cn("text-xs", lastfmSource === opt.value && "bg-accent")}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Period selector (only for Top) */}
        {lastfmSource === 'lastfm-top' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 text-xs w-[60px] justify-between shrink-0">
                {PERIOD_OPTIONS.find(opt => opt.value === lastfmPeriod)?.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[100px]">
              {PERIOD_OPTIONS.map((opt) => (
                <DropdownMenuItem 
                  key={opt.value} 
                  onClick={() => onPeriodChange(opt.value)}
                  className={cn("text-xs", lastfmPeriod === opt.value && "bg-accent")}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        
        {/* Add selected to markers button - always show when markers exist */}
        {hasAnyMarkers && (
          <AddSelectedToMarkersButton
            selectedCount={selectedCount}
            getTrackUris={getTrackUris}
            className="h-9 w-9 shrink-0"
          />
        )}
      </div>
    </div>
  );
}
