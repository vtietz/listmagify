import nodemailer from 'nodemailer';

/**
 * Creates and returns a configured SMTP transporter
 * Returns null if SMTP is not configured
 */
export function createEmailTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost) {
    console.warn('[email] SMTP not configured');
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort || '587', 10),
    secure: smtpPort === '465',
    auth: smtpUser && smtpPass ? {
      user: smtpUser,
      pass: smtpPass,
    } : undefined,
  });
}

/**
 * Gets the default sender email address
 */
export function getDefaultSender(): string {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  return smtpUser || `noreply@${smtpHost}`;
}
