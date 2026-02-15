import { createEmailTransporter, getDefaultSender, getBccRecipients } from './transporter';
import { replacePlaceholders, textToHtml } from './templates';

/**
 * Send access request approval email to user
 */
export async function sendApprovalEmail(name: string, email: string): Promise<void> {
  const transporter = createEmailTransporter();
  if (!transporter) {
    console.warn('[email] SMTP not configured, skipping approval email');
    return;
  }

  const approveTemplate = process.env.ACCESS_REQUEST_APPROVE_EMAIL || `Hi {name},

Thanks a lot for your interest in Listmagify. Since the app is currently running in Spotify's development mode, access is limited to a small allowlist of users. I've added you to that list, so you can now log in and start using the app.

If you decide at any point that you're no longer using the app, it would be great if you could let me know so I can free up the slot for another user.

Any feedback you're happy to share would be greatly appreciated — you can also use the feedback form directly in the app.

Your Listmagify Team`;

  const text = replacePlaceholders(approveTemplate, { name });
  const html = textToHtml(text);

  try {
    await transporter.sendMail({
      from: getDefaultSender(),
      to: email,
      bcc: getBccRecipients(),
      subject: '[Listmagify] Access Approved',
      text,
      html,
    });

    console.debug(`[email] Approval email sent to ${email}`);
  } catch (error) {
    console.error('[email] Failed to send approval email:', error);
    throw error;
  }
}

/**
 * Send access request rejection email to user
 */
export async function sendRejectionEmail(name: string, email: string): Promise<void> {
  const transporter = createEmailTransporter();
  if (!transporter) {
    console.warn('[email] SMTP not configured, skipping rejection email');
    return;
  }

  const rejectTemplate = process.env.ACCESS_REQUEST_REJECT_EMAIL || `Hi {name},

Thank you for your interest in Listmagify. 

Unfortunately, we're unable to approve your access request at this time due to limited user slots in Spotify's development mode.

You can find more information about this limitation in Spotify's developer documentation: 
https://developer.spotify.com/documentation/web-api/concepts/quota-modes

Your Listmagify Team`;

  const text = replacePlaceholders(rejectTemplate, { name });
  const html = textToHtml(text);

  try {
    await transporter.sendMail({
      from: getDefaultSender(),
      to: email,
      bcc: getBccRecipients(),
      subject: '[Listmagify] Access Request Update',
      text,
      html,
    });

    console.debug(`[email] Rejection email sent to ${email}`);
  } catch (error) {
    console.error('[email] Failed to send rejection email:', error);
    throw error;
  }
}

/**
 * Send access revoked email to user
 */
export async function sendRevokedEmail(name: string, email: string): Promise<void> {
  const transporter = createEmailTransporter();
  if (!transporter) {
    console.warn('[email] SMTP not configured, skipping revoked email');
    return;
  }

  const revokedTemplate = process.env.ACCESS_REQUEST_REVOKED_EMAIL || `Hi {name},

Due to limited user slots in Spotify's development mode or your low activity, we've had to remove your access to Listmagify.

If you'd like to use the app again, you're welcome to submit a new access request anytime.

Your Listmagify Team`;

  const text = replacePlaceholders(revokedTemplate, { name });
  const html = textToHtml(text);

  try {
    await transporter.sendMail({
      from: getDefaultSender(),
      to: email,
      bcc: getBccRecipients(),
      subject: '[Listmagify] Access Revoked',
      text,
      html,
    });

    console.debug(`[email] Revoked email sent to ${email}`);
  } catch (error) {
    console.error('[email] Failed to send revoked email:', error);
    throw error;
  }
}
