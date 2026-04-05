export function MoveProgressBar({
  current,
  total,
  onCancel,
}: {
  current: number;
  total: number;
  onCancel: () => void;
}) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-200"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="whitespace-nowrap">
        Moving tracks: {current} / {total}
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="ml-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}
