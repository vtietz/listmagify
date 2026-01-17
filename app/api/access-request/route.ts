import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getDb } from '@/lib/metrics/db';
import nodemailer from 'nodemailer';

/**
 * POST /api/access-request
 * 
 * Receives access request from landing page and sends email to admin.
 * Used while app is in Spotify development mode with limited user slots.
 */
export async function POST(request: NextRequest) {
  try {
    if (!serverEnv.ACCESS_REQUEST_ENABLED) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, email, spotifyUsername, motivation } = body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    // Check if SMTP is configured
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const contactEmail = process.env.CONTACT_EMAIL;

    if (!smtpHost || !contactEmail) {
      console.error('[access-request] SMTP not configured');
      return NextResponse.json(
        { error: 'Email service not configured. Please contact the administrator.' },
        { status: 503 }
      );
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587', 10),
      secure: smtpPort === '465',
      auth: smtpUser && smtpPass ? {
        user: smtpUser,
        pass: smtpPass,
      } : undefined,
    });

    // Send email to admin
    const mailOptions = {
      from: smtpUser || `noreply@${smtpHost}`,
      to: contactEmail,
      subject: `[Listmagify] Access Request from ${name.trim()}${motivation && motivation.trim() ? ' ⭐' : ''}`,
      text: `New access request for Listmagify:

Name: ${name.trim()}
Spotify Email: ${email.trim()}
${spotifyUsername && spotifyUsername.trim() ? `Spotify Username: ${spotifyUsername.trim()}\n` : ''}
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
    <td style="padding: 8px;">${escapeHtml(spotifyUsername.trim())}</td>
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
    };

    await transporter.sendMail(mailOptions);

    // Store in database if metrics are enabled
    try {
      const db = getDb();
      if (db) {
        db.prepare(`
          INSERT INTO access_requests (name, email, spotify_username, motivation, status)
          VALUES (?, ?, ?, ?, 'pending')
        `).run(
          name.trim(),
          email.trim(),
          spotifyUsername && spotifyUsername.trim() ? spotifyUsername.trim() : null,
          motivation && motivation.trim() ? motivation.trim() : null
        );
        console.debug(`[access-request] Stored in database for ${email}`);
      }
    } catch (dbError) {
      console.error(`[access-request] Failed to store in database:`, dbError);
      // Don't fail the request if DB storage fails
    }

    console.debug(`[access-request] Request sent for ${email}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[access-request] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send request. Please try again later.' },
      { status: 500 }
    );
  }
}

/** Escape HTML to prevent XSS in email */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
