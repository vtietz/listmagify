import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { isContactConfigured } from "@/lib/contact";
import type { ErrorReport, ErrorReportResponse } from "@/lib/errors/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/error-report
 * 
 * Receives error reports from the client and sends them via email.
 * Requires authentication to prevent abuse.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Check if error reporting is enabled
    if (process.env.ERROR_REPORTING_ENABLED !== 'true') {
      return NextResponse.json(
        { success: false, message: "Error reporting is not enabled" },
        { status: 503 }
      );
    }

    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    // Check if email is configured
    if (!isContactConfigured()) {
      return NextResponse.json(
        { success: false, message: "Error reporting not configured - contact email not set" },
        { status: 503 }
      );
    }

    const body = await request.json() as ErrorReport;
    
    // Validate required fields
    if (!body.error?.message || !body.error?.category) {
      return NextResponse.json(
        { success: false, message: "Invalid error report" },
        { status: 400 }
      );
    }

    // Build report metadata
    const reportId = `ERR-${Date.now().toString(36).toUpperCase()}`;

    // For now, log the report (email sending can be added later)
    // In a production system, you'd integrate with an email service like:
    // - Resend, SendGrid, AWS SES, etc.
    console.log(`[error-report] Report ${reportId} received:`);
    console.log(`[error-report] Category: ${body.error.category}`);
    console.log(`[error-report] Message: ${body.error.message}`);
    console.log(`[error-report] Details: ${body.error.details || 'N/A'}`);
    console.log(`[error-report] User Description: ${body.userDescription || 'N/A'}`);
    
    // Store in a simple log file (could be replaced with DB storage)
    const logEntry = {
      reportId,
      timestamp: new Date().toISOString(),
      userId: session.user.name,
      error: body.error,
      userDescription: body.userDescription,
      environment: body.environment,
    };
    
    // Log to console in structured format for easy parsing
    console.log(`[error-report] FULL_REPORT: ${JSON.stringify(logEntry)}`);

    // If you want to enable email sending, uncomment and configure:
    // const contact = getContactInfo();
    // const emailSubject = `[Listmagify Error Report] ${body.error.category}: ${body.error.message.slice(0, 50)}`;
    // const emailBody = formatErrorReport(body, reportId, session.user.name || "Anonymous");
    // await sendEmail({
    //   to: contact.email,
    //   subject: emailSubject,
    //   text: emailBody,
    // });

    const response: ErrorReportResponse = {
      success: true,
      message: "Error report received. Thank you for helping improve Listmagify!",
      reportId,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[error-report] Failed to process error report:", error);
    return NextResponse.json(
      { success: false, message: "Failed to submit error report" },
      { status: 500 }
    );
  }
}

/**
 * Format the error report as a readable email body
 * (Currently unused - will be used when email sending is enabled)
 */
/*
function formatErrorReport(report: ErrorReport, reportId: string, userName: string): string {
  const { error, userDescription, environment, appVersion } = report;
  
  const sections = [
    `ERROR REPORT: ${reportId}`,
    `${'='.repeat(50)}`,
    '',
    `SUMMARY`,
    `-------`,
    `Category: ${error.category}`,
    `Severity: ${error.severity}`,
    `Message: ${error.message}`,
    `Timestamp: ${error.timestamp}`,
    `Status Code: ${error.statusCode || 'N/A'}`,
    `Request Path: ${error.requestPath || 'N/A'}`,
    '',
  ];

  if (error.details) {
    sections.push(
      `DETAILS`,
      `-------`,
      error.details,
      ''
    );
  }

  if (error.retryAfter) {
    sections.push(
      `RATE LIMIT INFO`,
      `---------------`,
      `Retry After: ${error.retryAfter.seconds} seconds`,
      `Retry At: ${error.retryAfter.retryAt}`,
      ''
    );
  }

  if (userDescription) {
    sections.push(
      `USER DESCRIPTION`,
      `----------------`,
      userDescription,
      ''
    );
  }

  sections.push(
    `ENVIRONMENT`,
    `-----------`,
    `App Version: ${appVersion}`,
    `Platform: ${environment.platform}`,
    `Language: ${environment.language}`,
    `Screen Size: ${environment.screenSize}`,
    `User Agent: ${environment.userAgent}`,
    `Report Time: ${environment.timestamp}`,
    '',
    `REPORTER`,
    `--------`,
    `User: ${userName}`,
    ''
  );

  if (error.stack) {
    sections.push(
      `STACK TRACE (sanitized)`,
      `-----------------------`,
      error.stack,
      ''
    );
  }

  if (error.context && Object.keys(error.context).length > 0) {
    sections.push(
      `ADDITIONAL CONTEXT`,
      `------------------`,
      ...Object.entries(error.context).map(([k, v]) => `${k}: ${v}`),
      ''
    );
  }

  return sections.join('\n');
}
*/
