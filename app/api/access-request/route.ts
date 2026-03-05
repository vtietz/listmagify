import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getDb } from '@/lib/metrics/db';
import { createEmailTransporter, getDefaultSender, getBccRecipients } from '@/lib/email/transporter';
import { escapeHtml } from '@/lib/email/templates';
import { detectAccessRequestRedFlags, parseAccessRequestInput } from '@/lib/services/accessRequestService';
import { isAppRouteError } from '@/lib/errors';

function validateVerificationToken(email: string, verificationToken?: string): string | null {
  if (!serverEnv.ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED) {
    return null;
  }

  if (!verificationToken) {
    return 'Email verification required';
  }

  const db = getDb();
  if (!db) {
    console.warn('[access-request] Email verification enabled but database not available');
    return null;
  }

  const verification = db.prepare(`
    SELECT verified, email
    FROM email_verification_codes
    WHERE verification_token = ? AND verified = 1
    LIMIT 1
  `).get(verificationToken) as { verified: number; email: string } | undefined;

  if (!verification) {
    return 'Invalid or unverified email';
  }

  if (verification.email !== email.trim().toLowerCase()) {
    return 'Email does not match verified email';
  }

  return null;
}

function getMailer() {
  const contactEmail = process.env.CONTACT_EMAIL;
  const transporter = createEmailTransporter();

  if (!transporter || !contactEmail) {
    return null;
  }

  return { transporter, contactEmail };
}

export async function POST(request: NextRequest) {
  try {
    if (!serverEnv.ACCESS_REQUEST_ENABLED) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const payload = parseAccessRequestInput(await request.json());
    const { name, email, spotifyUsername, motivation, verificationToken } = payload;

    const verificationError = validateVerificationToken(email, verificationToken);
    if (verificationError) {
      return NextResponse.json({ error: verificationError }, { status: 400 });
    }

    const redFlags = detectAccessRequestRedFlags({
      name,
      ...(spotifyUsername ? { spotifyUsername } : {}),
      ...(motivation ? { motivation } : {}),
    });

    const mailer = getMailer();
    if (!mailer) {
      console.error('[access-request] SMTP not configured');
      return NextResponse.json(
        { error: 'Email service not configured. Please contact the administrator.' },
        { status: 503 }
      );
    }

    await mailer.transporter.sendMail({
      from: getDefaultSender(),
      to: mailer.contactEmail,
      bcc: getBccRecipients(),
      subject: `[Listmagify] Access Request from ${name.trim()}${redFlags.length > 0 ? ' 🚩' : ''}${motivation && motivation.trim() ? ' ⭐' : ''}`,
      text: `New access request for Listmagify:

Name: ${name.trim()}
Spotify Email: ${email.trim()}
${spotifyUsername && spotifyUsername.trim() ? `Spotify Username: ${spotifyUsername.trim()}\n` : ''}
${redFlags.length > 0 ? `\n🚩 RED FLAGS:\n${redFlags.map((flag) => `  - ${flag}`).join('\n')}\n` : ''}
${motivation && motivation.trim() ? `\nMotivation:\n${motivation.trim()}\n` : ''}
To approve this user:
1. Go to https://developer.spotify.com/dashboard
2. Select your app
3. Go to Settings > User Management
4. Add the user with the email above

---
This is an automated message from Listmagify.
`,
      html: `
<h2>New Access Request for Listmagify</h2>
${redFlags.length > 0 ? `
<div style="background-color: #fee; border: 2px solid #c33; border-radius: 4px; padding: 12px; margin-bottom: 16px;">
  <strong style="color: #c33;">🚩 RED FLAGS DETECTED:</strong>
  <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #666;">
    ${redFlags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join('\n    ')}
  </ul>
</div>
` : ''}
<table style="border-collapse: collapse;">
  <tr>
    <td style="padding: 8px; font-weight: bold;">Name:</td>
    <td style="padding: 8px;">${escapeHtml(name.trim())}</td>
  </tr>
  <tr>
    <td style="padding: 8px; font-weight: bold;">Spotify Email:</td>
    <td style="padding: 8px;">${escapeHtml(email.trim())}</td>
  </tr>
  ${spotifyUsername && spotifyUsername.trim() ? `
  <tr>
    <td style="padding: 8px; font-weight: bold;">Spotify Username:</td>
    <td style=\"padding: 8px;\">${escapeHtml(spotifyUsername.trim())}</td>
  </tr>
  ` : ''}
  ${motivation && motivation.trim() ? `
  <tr>
    <td style="padding: 8px; font-weight: bold; vertical-align: top;">Motivation:</td>
    <td style="padding: 8px; background-color: #f0f9ff; border-left: 3px solid #0ea5e9;">${escapeHtml(motivation.trim()).replace(/\n/g, '<br>')}</td>
  </tr>
  ` : ''}
</table>

<h3>To approve this user:</h3>
<ol>
  <li>Go to <a href="https://developer.spotify.com/dashboard">Spotify Developer Dashboard</a></li>
  <li>Select your app</li>
  <li>Go to Settings → User Management</li>
  <li>Add the user with the email above</li>
</ol>

<hr>
<p style="color: #666; font-size: 12px;">This is an automated message from Listmagify.</p>
`,
    });

    try {
      const db = getDb();
      if (db) {
        db.prepare(`
          INSERT INTO access_requests (name, email, spotify_username, motivation, status, red_flags)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(
          name.trim(),
          email.trim(),
          spotifyUsername && spotifyUsername.trim() ? spotifyUsername.trim() : null,
          motivation && motivation.trim() ? motivation.trim() : null,
          redFlags.length > 0 ? JSON.stringify(redFlags) : null
        );
        console.debug(`[access-request] Stored in database for ${email}`);
      }
    } catch (dbError) {
      console.error(`[access-request] Failed to store in database:`, dbError);
    }

    console.debug(`[access-request] Request sent for ${email}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message.includes('required')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[access-request] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send request. Please try again later.' },
      { status: 500 }
    );
  }
}