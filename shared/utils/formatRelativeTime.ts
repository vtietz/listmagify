function parseDateString(dateStr: string): Date {
  // SQLite timestamps are commonly returned as `YYYY-MM-DD HH:MM:SS` in UTC.
  // Treat this shape as UTC to avoid local-time offset errors (for example `2h ago` on fresh items).
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(dateStr)) {
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
}

export function formatRelativeTime(dateStr: string): string {
  const parsed = parseDateString(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return 'just now';
  }

  const diff = Date.now() - parsed.getTime();
  const absDiff = Math.abs(diff);
  const isFuture = diff < 0;
  const minutes = Math.floor(absDiff / 60000);
  if (minutes < 1) return isFuture ? 'in <1m' : 'just now';
  if (minutes < 60) return isFuture ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isFuture ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}
