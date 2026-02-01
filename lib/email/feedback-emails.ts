import { createEmailTransporter, getDefaultSender } from './transporter';
import { escapeHtml } from './templates';

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

  const transporter = createEmailTransporter();

  // Build email content
  const hasScore = npsScore !== null;
  const hasComment = comment && comment.trim().length > 0;

  const subject = hasScore
    ? `[Listmagify Feedback] ${getNpsCategory(npsScore)} (${npsScore}/10) ${getNpsEmoji(npsScore)}`
    : '[Listmagify Feedback] New comment';

  const textBody = [
    'NEW FEEDBACK RECEIVED',
    '='.repeat(50),
    '',
    hasScore ? `NPS Score: ${npsScore}/10 (${getNpsCategory(npsScore)}) ${getNpsEmoji(npsScore)}` : '',
    '',
    hasComment ? `Comment:\n${comment}` : 'No comment provided.',
    '',
    '─'.repeat(50),
    userId ? `User ID: ${userId}` : 'Anonymous feedback',
    name ? `Name: ${name}` : '',
    email ? `Email: ${email}` : '',
    `Submitted at: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>📝 New Feedback Received</h2>
      
      ${hasScore ? `
        <div style="background: ${npsScore >= 9 ? '#d1fae5' : npsScore >= 7 ? '#fef3c7' : '#fee2e2'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">NPS Score: ${npsScore}/10 ${getNpsEmoji(npsScore)}</h3>
          <p style="margin: 0; color: #666; font-size: 14px;">${getNpsCategory(npsScore)}</p>
        </div>
      ` : ''}
      
      ${hasComment ? `
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
          <strong>Comment:</strong>
          <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${escapeHtml(comment)}</p>
        </div>
      ` : '<p style="color: #888;">No comment provided.</p>'}
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p style="color: #888; font-size: 12px;">
        ${userId ? `User ID: ${userId}` : 'Anonymous feedback'}<br>
        ${name ? `Name: ${escapeHtml(name)}<br>` : ''}
        ${email ? `Email: ${email}<br>` : ''}
        Submitted at: ${new Date().toISOString()}
      </p>
    </div>
  `;

  // If SMTP is not configured, just log the feedback
  if (!transporter) {
    console.log('[email] SMTP not configured. Feedback notification:');
    console.log(textBody);
    return;
  }

  try {
    await transporter.sendMail({
      from: getDefaultSender(),
      to,
      subject,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[email] Feedback notification sent to ${to}`);
  } catch (error) {
    console.error('[email] Failed to send feedback email:', error);
    throw error;
  }
}
