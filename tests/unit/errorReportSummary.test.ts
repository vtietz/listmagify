import { describe, expect, it } from 'vitest';
import { generateErrorSummary } from '@/components/stats/dialogs/errorReportSummary';
import type { ErrorReport } from '@/components/stats/types';

function makeReport(overrides: Partial<ErrorReport> = {}): ErrorReport {
  return {
    id: 1,
    report_id: 'rpt-1',
    ts: '2026-03-17T10:00:00.000Z',
    user_id: 'u-1',
    user_name: 'Ada',
    user_hash: null,
    error_category: 'api',
    error_severity: 'error',
    error_message: 'Something failed',
    error_details: null,
    error_status_code: null,
    error_request_path: null,
    user_description: null,
    environment_json: null,
    app_version: '1.2.3',
    resolved: 0,
    ...overrides,
  };
}

describe('generateErrorSummary', () => {
  it('includes optional sections when data is present', () => {
    const summary = generateErrorSummary(
      makeReport({
        error_details: 'stacktrace',
        user_description: 'clicked\nthen failed',
        error_request_path: '/api/foo',
        error_status_code: 500,
        environment_json: JSON.stringify({ browser: 'Firefox', os: 'Linux' }),
        resolved: 1,
      })
    );

    expect(summary).toContain('## Error Details');
    expect(summary).toContain('## User Description');
    expect(summary).toContain('## Request Information');
    expect(summary).toContain('## Environment');
    expect(summary).toContain('Resolved');
  });

  it('handles invalid environment JSON gracefully', () => {
    const summary = generateErrorSummary(
      makeReport({ environment_json: '{bad-json' })
    );

    expect(summary).toContain('# Error Report Summary');
    expect(summary).not.toContain('## Environment');
  });
});
