/**
 * Email utilities for sending notifications.
 * 
 * @deprecated This file is being phased out. Use specific email modules instead:
 * - lib/email/feedback-emails.ts for feedback notifications
 * - lib/email/error-report-emails.ts for error reports
 * - lib/email/access-request-emails.ts for access request notifications
 * - lib/email/verification-emails.ts for email verification codes
 */

// Re-export for backward compatibility
export { sendFeedbackEmail } from './email/feedback-emails';
export { sendErrorReportEmail } from './email/error-report-emails';
