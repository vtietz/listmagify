import { createEmailTransporter, getDefaultSender } from './transporter';

/**
 * Send email verification code for access requests
 */
export async function sendVerificationCodeEmail(email: string, code: string): Promise<void> {
  const transporter = createEmailTransporter();

  if (!transporter) {
    console.error('[email] SMTP not configured, cannot send verification email');
    throw new Error('Email service not configured');
  }

  const mailOptions = {
    from: getDefaultSender(),
    to: email,
    subject: '[Listmagify] Verify your email address',
    text: `Your verification code is: ${code}

This code will expire in 15 minutes.

If you didn't request access to Listmagify, please ignore this email.

Note: Check your spam folder if you don't see this email in your inbox.

---
This is an automated message from Listmagify.
`,
    html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Verify your email address</h2>
  
  <p>Your verification code is:</p>
  
  <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${code}</span>
  </div>
  
  <p style="color: #666;">This code will expire in <strong>15 minutes</strong>.</p>
  
  <p style="color: #666; font-size: 14px; margin-top: 30px;">
    If you didn't request access to Listmagify, please ignore this email.
  </p>
  
  <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px; margin: 20px 0;">
    <p style="margin: 0; color: #856404; font-size: 14px;">
      💡 <strong>Tip:</strong> Check your spam folder if you don't see this email in your inbox.
    </p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="color: #999; font-size: 12px; text-align: center;">
    This is an automated message from Listmagify.
  </p>
</div>
`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.debug(`[email] Verification code sent to ${email}`);
  } catch (error) {
    console.error('[email] Failed to send verification email:', error);
    throw error;
  }
}
