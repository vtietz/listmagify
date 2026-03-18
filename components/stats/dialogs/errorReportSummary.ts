import type { ErrorReport } from '../types';

type EnvironmentPayload = {
  userAgent?: string;
  url?: string;
  viewport?: string;
  browser?: string;
  os?: string;
};

function parseEnvironment(environmentJson: string | null): EnvironmentPayload {
  if (!environmentJson) {
    return {};
  }

  try {
    return JSON.parse(environmentJson) as EnvironmentPayload;
  } catch {
    return {};
  }
}

function buildOptionalSection(title: string, body: string | null): string {
  if (!body) {
    return '';
  }

  return `\n\n## ${title}\n${body}`;
}

function buildRequestSection(report: ErrorReport): string {
  if (!report.error_request_path) {
    return '';
  }

  const statusLine = report.error_status_code
    ? `\n- **Status Code:** ${report.error_status_code}`
    : '';

  return `\n\n## Request Information\n- **Path:** ${report.error_request_path}${statusLine}`;
}

function buildEnvironmentSection(report: ErrorReport, environment: EnvironmentPayload): string {
  if (Object.keys(environment).length === 0) {
    return '';
  }

  return `\n\n## Environment\n- **App Version:** ${report.app_version || 'N/A'}\n- **User Agent:** ${environment.userAgent || 'N/A'}\n- **URL:** ${environment.url || 'N/A'}\n- **Viewport:** ${environment.viewport || 'N/A'}\n- **Browser:** ${environment.browser || 'N/A'}\n- **OS:** ${environment.os || 'N/A'}`;
}

export function generateErrorSummary(report: ErrorReport): string {
  const environment = parseEnvironment(report.environment_json);
  const detailsBody = report.error_details ? `\`\`\`\n${report.error_details}\n\`\`\`` : null;
  const userDescriptionBody = report.user_description
    ? `> ${report.user_description.split('\n').join('\n> ')}`
    : null;

  return `# Error Report Summary

**Report ID:** ${report.report_id}
**Timestamp:** ${new Date(report.ts).toLocaleString()}
**Category:** ${report.error_category}
**Severity:** ${report.error_severity}
**User:** ${report.user_name || 'Anonymous'}${report.user_id ? ` (${report.user_id})` : ''}
${report.user_hash ? `**User Hash:** ${report.user_hash}` : ''}

## Error Message
${report.error_message}${buildOptionalSection('Error Details', detailsBody)}${buildOptionalSection('User Description', userDescriptionBody)}${buildRequestSection(report)}${buildEnvironmentSection(report, environment)}

---
*Status: ${report.resolved ? 'Resolved ✓' : 'Unresolved'}*
`;
}
