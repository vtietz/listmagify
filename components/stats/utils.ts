export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function getDateRange(range: 'today' | '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom'): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split('T')[0]!;
  
  switch (range) {
    case 'today':
      return { from: to, to };
    case '7d':
      return {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case '30d':
      return {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case '90d':
      return {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
    case 'ytd':
      return {
        from: `${today.getFullYear()}-01-01`,
        to,
      };
    case 'all':
      return {
        from: '2020-01-01',
        to,
      };
    default:
      return {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        to,
      };
  }
}
