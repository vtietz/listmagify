import { createEmailTransporter, getDefaultSender, getBccRecipients } from './transporter';
import { escapeHtml } from './templates';

interface ErrorReportEmailParams {
  to: string;
  reportId: string;
  userName: string;
  error: {
    category: string;
    severity: string;
    message: string;
    details?: string;
    statusCode?: number;
    requestPath?: string;
    timestamp: string;
    stack?: string;
    context?: Record<string, string | number | boolean>;
    retryAfter?: {
      seconds: number;
      retryAt: string;
    };
  };
  userDescription?: string | undefined;
  environment: {
    platform: string;
    language: string;
    screenSize: string;
    userAgent: string;
    timestamp: string;
  };
  appVersion: string;
}

/**
 * Send error report notification email.
 * If SMTP is not configured, logs to console instead.
 */
export async function sendErrorReportEmail(params: ErrorReportEmailParams): Promise<void> {
  const { to, reportId, userName, error, userDescription, environment, appVersion } = params;

  const transporter = createEmailTransporter();

  const subject = `[Listmagify Error Report] ${error.category}: ${error.message.slice(0, 50)}`;

  const textBody = [
    `ERROR REPORT: ${reportId}`,
    '='.repeat(50),
    '',
    'SUMMARY',
    '-------',
    `Category: ${error.category}`,
    `Severity: ${error.severity}`,
    `Message: ${error.message}`,
    `Timestamp: ${error.timestamp}`,
    `Status Code: ${error.statusCode || 'N/A'}`,
    `Request Path: ${error.requestPath || 'N/A'}`,
    '',
    error.details ? `DETAILS\n-------\n${error.details}\n` : '',
    error.retryAfter ? `RATE LIMIT INFO\n---------------\nRetry After: ${error.retryAfter.seconds} seconds\nRetry At: ${error.retryAfter.retryAt}\n` : '',
    userDescription ? `USER DESCRIPTION\n----------------\n${userDescription}\n` : '',
    'ENVIRONMENT',
    '-----------',
    `App Version: ${appVersion}`,
    `Platform: ${environment.platform}`,
    `Language: ${environment.language}`,
    `Screen Size: ${environment.screenSize}`,
    `User Agent: ${environment.userAgent}`,
    `Report Time: ${environment.timestamp}`,
    '',
    'REPORTER',
    '--------',
    `User: ${userName}`,
    '',
    error.stack ? `STACK TRACE (sanitized)\n-----------------------\n${error.stack}\n` : '',
    error.context && Object.keys(error.context).length > 0
      ? `ADDITIONAL CONTEXT\n------------------\n${Object.entries(error.context).map(([k, v]) => `${k}: ${v}`).join('\n')}\n`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto;">
      <h2 style="color: #ef4444;">🚨 Error Report: ${reportId}</h2>
      
      <div style="background: #fee2e2; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #991b1b;">Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Category:</td><td style="padding: 4px 8px;">${error.category}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Severity:</td><td style="padding: 4px 8px;">${error.severity}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Message:</td><td style="padding: 4px 8px;">${escapeHtml(error.message)}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Timestamp:</td><td style="padding: 4px 8px;">${error.timestamp}</td></tr>
          ${error.statusCode ? `<tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Status Code:</td><td style="padding: 4px 8px;">${error.statusCode}</td></tr>` : ''}
          ${error.requestPath ? `<tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Request Path:</td><td style="padding: 4px 8px;">${error.requestPath}</td></tr>` : ''}
        </table>
      </div>

      ${error.details ? `
        <div style="background: #fafafa; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
          <strong>Details:</strong>
          <pre style="margin: 10px 0 0 0; white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 12px;">${escapeHtml(error.details)}</pre>
        </div>
      ` : ''}

      ${error.retryAfter ? `
        <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
          <strong>Rate Limit Info:</strong>
          <p style="margin: 10px 0 0 0;">Retry After: ${error.retryAfter.seconds} seconds<br>Retry At: ${error.retryAfter.retryAt}</p>
        </div>
      ` : ''}

      ${userDescription ? `
        <div style="background: #dbeafe; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
          <strong>User Description:</strong>
          <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${escapeHtml(userDescription)}</p>
        </div>
      ` : ''}

      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <strong>Environment:</strong>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <tr><td style="padding: 4px 8px; font-weight: bold;">App Version:</td><td style="padding: 4px 8px;">${appVersion}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Platform:</td><td style="padding: 4px 8px;">${environment.platform}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Language:</td><td style="padding: 4px 8px;">${environment.language}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">Screen Size:</td><td style="padding: 4px 8px;">${environment.screenSize}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold;">User Agent:</td><td style="padding: 4px 8px; font-size: 11px;">${environment.userAgent}</td></tr>
        </table>
      </div>

      <div style="background: #fafafa; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <strong>Reporter:</strong>
        <p style="margin: 10px 0 0 0;">${escapeHtml(userName)}</p>
      </div>

      ${error.stack ? `
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>Stack Trace (sanitized):</strong>
          <pre style="margin: 10px 0 0 0; white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 11px; overflow-x: auto;">${escapeHtml(error.stack)}</pre>
        </div>
      ` : ''}

      ${error.context && Object.keys(error.context).length > 0 ? `
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>Additional Context:</strong>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            ${Object.entries(error.context).map(([k, v]) => `
              <tr><td style="padding: 4px 8px; font-weight: bold;">${escapeHtml(k)}:</td><td style="padding: 4px 8px;">${escapeHtml(String(v))}</td></tr>
            `).join('')}
          </table>
        </div>
      ` : ''}

      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p style="color: #888; font-size: 12px;">
        Report ID: ${reportId}<br>
        Submitted at: ${new Date().toISOString()}
      </p>
    </div>
  `;

  // If SMTP is not configured, just log the error report
  if (!transporter) {
    console.log('[email] SMTP not configured. Error report notification:');
    console.log(textBody);
    return;
  }

  try {
    await transporter.sendMail({
      from: getDefaultSender(),
      to,
      bcc: getBccRecipients(),
      subject,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[email] Error report notification sent to ${to}`);
  } catch (error) {
    console.error('[email] Failed to send error report email:', error);
    throw error;
  }
}
