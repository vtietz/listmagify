import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getDb } from '@/lib/metrics/db';
import nodemailer from 'nodemailer';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';

/**
 * Check if a Spotify username exists by calling Spotify API
 * Uses admin's token if available (when called from authenticated context)
 * Returns true if user exists, false if not found, null if check failed
 */
async function verifySpotifyUsername(username: string): Promise<boolean | null> {
  try {
    // Try to get admin session for API access
    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken;
    
    if (!accessToken) {
      // No admin token available, skip verification
      return null;
    }

    const response = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(username)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      return true; // User exists
    } else if (response.status === 404) {
      return false; // User not found
    } else {
      // Other error (rate limit, auth error, etc.) - don't penalize user
      console.warn(`[access-request] Spotify username check returned ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error('[access-request] Error verifying Spotify username:', error);
    return null; // Network error - don't penalize user
  }
}

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

    // Detect suspicious patterns (red flags)
    const redFlags: string[] = [];
    const nameTrimmed = name.trim();
    const spotifyUsernameTrimmed = spotifyUsername?.trim();

    // Red flag: Name looks like a username (no spaces, all lowercase)
    if (!nameTrimmed.includes(' ') && nameTrimmed === nameTrimmed.toLowerCase()) {
      redFlags.push('Name looks like username (no spaces, lowercase)');
    }

    // Red flag: Spotify username contains spaces (invalid format)
    if (spotifyUsernameTrimmed && spotifyUsernameTrimmed.includes(' ')) {
      redFlags.push('Spotify username contains spaces (invalid)');
    }

    // Red flag: Verify Spotify username exists (if provided)
    if (spotifyUsernameTrimmed && !spotifyUsernameTrimmed.includes(' ')) {
      const usernameExists = await verifySpotifyUsername(spotifyUsernameTrimmed);
      if (usernameExists === false) {
        redFlags.push('Spotify username does not exist');
      }
    }

    // Red flag: Very short name (likely fake)
    if (nameTrimmed.length < 3) {
      redFlags.push('Name too short (< 3 chars)');
    }

    // Red flag: Generic/templated motivation
    const motivationLower = motivation?.trim().toLowerCase();
    if (motivationLower) {
      const genericPhrases = [
        'para melhorar',
        'to improve',
        'want to use',
        'please approve',
        'give me access',
        'test',
        'testing'
      ];
      if (genericPhrases.some(phrase => motivationLower === phrase || motivationLower.length < 10)) {
        redFlags.push('Generic or very short motivation');
      }
    }

    // Red flag: Email and name mismatch (email prefix doesn't match name)
    const emailPrefix = email.split('@')[0]?.toLowerCase() ?? '';
    const nameNormalized = nameTrimmed.toLowerCase().replace(/\s+/g, '');
    if (emailPrefix && !emailPrefix.includes(nameNormalized.substring(0, 4)) && !nameNormalized.includes(emailPrefix.substring(0, 4))) {
      redFlags.push('Email and name mismatch');
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
      subject: `[Listmagify] Access Request from ${name.trim()}${redFlags.length > 0 ? ' 🚩' : ''}${motivation && motivation.trim() ? ' ⭐' : ''}`,
      text: `New access request for Listmagify:

Name: ${name.trim()}
Spotify Email: ${email.trim()}
${spotifyUsername && spotifyUsername.trim() ? `Spotify Username: ${spotifyUsername.trim()}\n` : ''}
${redFlags.length > 0 ? `\n🚩 RED FLAGS:\n${redFlags.map(f => `  - ${f}`).join('\n')}\n` : ''}
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
    ${redFlags.map(flag => `<li>${escapeHtml(flag)}</li>`).join('\n    ')}
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
