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
