import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export function EmptyStateCollapsed({ onToggleExpand }: { onToggleExpand: () => void }) {
  return (
    <div
      className="border-t border-border bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
      onClick={onToggleExpand}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Select tracks to get recommendations</span>
        </div>
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export function EmptyStateExpanded({ onToggleExpand }: { onToggleExpand: () => void }) {
  return (
    <div className="border-t border-border bg-background flex flex-col h-full">
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors flex-shrink-0"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Recommendations</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <div className="text-center p-4">
          <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p>Select one or more tracks to get recommendations</p>
        </div>
      </div>
    </div>
  );
}

export function CollapsedPanel({ selectedTrackIds, onToggleExpand }: { selectedTrackIds: string[]; onToggleExpand: () => void }) {
  return (
    <div
      className="border-t border-border bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
      onClick={onToggleExpand}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>
            Recommendations based on {selectedTrackIds.length} selected track{selectedTrackIds.length !== 1 ? 's' : ''}
          </span>
        </div>
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}