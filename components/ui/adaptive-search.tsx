"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface AdaptiveSearchProps {
  /** Current search value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** ARIA label */
  ariaLabel?: string;
  /** Breakpoint width in pixels (below this width, shows icon only) */
  breakpoint?: number;
  /** Additional className for the container */
  className?: string;
}

/**
 * AdaptiveSearch - A responsive search field that adapts to available space.
 * 
 * - When space is available: Shows full search input inline
 * - When space is constrained: Shows search icon that opens a popover with the input
 * 
 * Uses ResizeObserver to dynamically switch between modes.
 */
export function AdaptiveSearch({
  value,
  onChange,
  placeholder = "Search...",
  disabled = false,
  ariaLabel = "Search",
  breakpoint = 200,
  className,
}: AdaptiveSearchProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Measure available space and switch modes
  const measureSpace = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = Math.floor(container.getBoundingClientRect().width);
    const shouldBeCompact = containerWidth < breakpoint;

    if (shouldBeCompact !== isCompact) {
      setIsCompact(shouldBeCompact);
    }
  }, [breakpoint, isCompact]);

  // Set up resize observer
  useEffect(() => {
    measureSpace();

    const observer = new ResizeObserver(() => {
      measureSpace();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [measureSpace]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  // Input element for both inline and popover
  const searchInput = (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        disabled={disabled}
        className="pl-9"
        aria-label={ariaLabel}
      />
    </div>
  );

  // Compact mode: Search icon with popover
  if (isCompact) {
    return (
      <div ref={containerRef} className={cn("flex items-center", className)}>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled}
              title={ariaLabel}
              aria-label={ariaLabel}
              className="shrink-0"
            >
              <Search className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start">
            <div className="space-y-2">
              <div className="text-sm font-medium">{ariaLabel}</div>
              {searchInput}
              {value && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="w-full"
                >
                  Clear search
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Full mode: Inline search input
  return (
    <div ref={containerRef} className={cn("flex-1 max-w-sm", className)}>
      {searchInput}
    </div>
  );
}
