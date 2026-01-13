/**
 * Email utilities for sending notifications.
 * 
 * Uses nodemailer for email delivery when SMTP is configured.
 * Falls back to logging when SMTP is not available.
 */

import nodemailer from 'nodemailer';

interface FeedbackEmailParams {
  to: string;
  npsScore: number | null;
  comment: string | null;
  name: string | null;
  email: string | null;
  userId: string | null;
}

/**
 * Get NPS category label for display.
 */
function getNpsCategory(score: number): string {
  if (score >= 9) return 'Promoter';
  if (score >= 7) return 'Passive';
  return 'Detractor';
}

/**
 * Get emoji for NPS score visualization.
 */
function getNpsEmoji(score: number): string {
  if (score >= 9) return '🎉';
  if (score >= 7) return '😊';
  if (score >= 4) return '😐';
  return '😞';
}

/**
 * Send feedback notification email.
 * If SMTP is not configured, logs to console instead.
 */
export async function sendFeedbackEmail(params: FeedbackEmailParams): Promise<void> {
  const { to, npsScore, comment, userId, name, email } = params;
  
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'noreply@listmagify.com';

  const subject =
    typeof npsScore === 'number'
      ? `[Listmagify Feedback] NPS ${npsScore}/10 - ${getNpsCategory(npsScore)}`
      : `[Listmagify Feedback] New message`;
  
  const textBody = [
    `New feedback received for Listmagify`,
    '',
    typeof npsScore === 'number'
      ? `NPS Score: ${npsScore}/10 (${getNpsCategory(npsScore)}) ${getNpsEmoji(npsScore)}`
      : 'NPS Score: (not provided)',
    '',
    name ? `Name: ${name}` : 'Name: (not provided)',
    email ? `Email: ${email}` : 'Email: (not provided)',
    '',
    comment ? `Comment:\n${comment}` : 'No comment provided.',
    '',
    userId ? `User ID: ${userId}` : 'Anonymous feedback',
    '',
    `Submitted at: ${new Date().toISOString()}`,
  ].join('\n');

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1DB954;">New Feedback Received ${typeof npsScore === 'number' ? getNpsEmoji(npsScore) : ''}</h2>
      
      ${typeof npsScore === 'number' ? `
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="font-size: 48px; text-align: center; margin-bottom: 10px;">
            ${npsScore}/10
          </div>
          <div style="text-align: center; color: ${npsScore >= 9 ? '#22c55e' : npsScore >= 7 ? '#f59e0b' : '#ef4444'}; font-weight: bold;">
            ${getNpsCategory(npsScore)}
          </div>
        </div>
      ` : `
        <p style="color: #888;">No NPS score provided.</p>
      `}

      <div style="background: #fafafa; padding: 15px; border-left: 4px solid #1DB954; margin: 20px 0;">
        <strong>Contact:</strong>
        <p style="margin: 10px 0 0 0; white-space: pre-wrap;">
          ${name ? `Name: ${name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}` : 'Name: (not provided)'}<br>
          ${email ? `Email: ${email.replace(/</g, '&lt;').replace(/>/g, '&gt;')}` : 'Email: (not provided)'}
        </p>
      </div>
      
      ${comment ? `
        <div style="background: #fafafa; padding: 15px; border-left: 4px solid #1DB954; margin: 20px 0;">
          <strong>Comment:</strong>
          <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${comment.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
      ` : '<p style="color: #888;">No comment provided.</p>'}
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p style="color: #888; font-size: 12px;">
        ${userId ? `User ID: ${userId}` : 'Anonymous feedback'}<br>
        Submitted at: ${new Date().toISOString()}
      </p>
    </div>
  `;

  // If SMTP is not configured, just log the feedback
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[email] SMTP not configured. Feedback notification:');
    console.log(textBody);
    return;
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  // Send email
  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text: textBody,
    html: htmlBody,
  });

  console.log(`[email] Feedback notification sent to ${to}`);
}

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

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'noreply@listmagify.com';

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
          <tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Message:</td><td style="padding: 4px 8px;">${error.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>
          <tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Timestamp:</td><td style="padding: 4px 8px;">${error.timestamp}</td></tr>
          ${error.statusCode ? `<tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Status Code:</td><td style="padding: 4px 8px;">${error.statusCode}</td></tr>` : ''}
          ${error.requestPath ? `<tr><td style="padding: 4px 8px; font-weight: bold; color: #7f1d1d;">Request Path:</td><td style="padding: 4px 8px;">${error.requestPath}</td></tr>` : ''}
        </table>
      </div>

      ${error.details ? `
        <div style="background: #fafafa; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0;">
          <strong>Details:</strong>
          <pre style="margin: 10px 0 0 0; white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 12px;">${error.details.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
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
          <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${userDescription.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
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
        <p style="margin: 10px 0 0 0;">${userName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      </div>

      ${error.stack ? `
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>Stack Trace (sanitized):</strong>
          <pre style="margin: 10px 0 0 0; white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 11px; overflow-x: auto;">${error.stack.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </div>
      ` : ''}

      ${error.context && Object.keys(error.context).length > 0 ? `
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>Additional Context:</strong>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            ${Object.entries(error.context).map(([k, v]) => `
              <tr><td style="padding: 4px 8px; font-weight: bold;">${k.replace(/</g, '&lt;').replace(/>/g, '&gt;')}:</td><td style="padding: 4px 8px;">${String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>
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
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[email] SMTP not configured. Error report notification:');
    console.log(textBody);
    return;
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  // Send email
  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text: textBody,
    html: htmlBody,
  });

  console.log(`[email] Error report notification sent to ${to}`);
}
