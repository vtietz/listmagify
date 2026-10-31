import { createEmailTransporter, getDefaultSender } from './transporter';
import { replacePlaceholders, textToHtml } from './templates';

/**
 * Tell a user that background sync stopped because their provider
 * authorization expired or was revoked.
 *
 * Returns false when SMTP is not configured (nothing was sent).
 */
export async function sendReauthRequiredEmail(params: {
  email: string;
  providerName: string;
  appUrl: string;
}): Promise<boolean> {
  const transporter = createEmailTransporter();
  if (!transporter) {
    console.warn('[email] SMTP not configured, skipping re-auth email');
    return false;
  }

  const template = process.env.REAUTH_REQUIRED_EMAIL || `Hi,

your {provider} connection in Listmagify has expired or was revoked, so your scheduled playlist syncs are paused.

To resume them, simply sign in with {provider} again:
{url}

Your syncs pick up automatically right after you sign in. This is the only reminder you will get about this.

You receive this email because you set up a background sync in Listmagify. If you no longer use it, you can ignore this message or disconnect {provider} in the app, which deletes your stored data.

Your Listmagify Team`;

  const text = replacePlaceholders(template, { provider: params.providerName, url: params.appUrl });
  const html = textToHtml(text);

  await transporter.sendMail({
    from: getDefaultSender(),
    to: params.email,
    subject: `[Listmagify] Please reconnect ${params.providerName} to keep syncing`,
    text,
    html,
  });

  console.debug(`[email] Re-auth email sent for ${params.providerName}`);
  return true;
}
