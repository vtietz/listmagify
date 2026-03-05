import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { isContactConfigured, getContactInfo } from "@/lib/contact";
import { sendErrorReportEmail } from "@/lib/email";
import { getDb } from "@/lib/metrics/db";
import { hashUserId } from "@/lib/metrics/logger";
import type { ErrorReport, ErrorReportResponse } from "@/lib/errors/types";

export const dynamic = "force-dynamic";

function isErrorReportingEnabled(): boolean {
  return process.env.ERROR_REPORTING_ENABLED === 'true';
}

function validateErrorReportPayload(body: ErrorReport): boolean {
  return Boolean(body.error?.message && body.error?.category);
}

function buildReportId(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}`;
}

function logErrorReport(reportId: string, session: { user: { id?: string | null; name?: string | null } }, body: ErrorReport) {
  console.debug(`[error-report] Report ${reportId} received:`);
  console.debug(`[error-report] Category: ${body.error.category}`);
  console.debug(`[error-report] Message: ${body.error.message}`);
  console.debug(`[error-report] Details: ${body.error.details || 'N/A'}`);
  console.debug(`[error-report] User Description: ${body.userDescription || 'N/A'}`);

  const logEntry = {
    reportId,
    timestamp: new Date().toISOString(),
    userId: session.user.id,
    userName: session.user.name,
    error: body.error,
    userDescription: body.userDescription,
    environment: body.environment,
  };

  console.debug(`[error-report] FULL_REPORT: ${JSON.stringify(logEntry)}`);
}

function persistErrorReport(reportId: string, session: { user: { id?: string | null; name?: string | null } }, body: ErrorReport): void {
  try {
    const db = getDb();
    if (!db) {
      return;
    }

    const userHash = hashUserId(session.user.id || '');
    db.prepare(`
      INSERT INTO error_reports (
        report_id, user_id, user_name, user_hash,
        error_category, error_severity, error_message, error_details,
        error_status_code, error_request_path, user_description,
        environment_json, app_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      session.user.id,
      session.user.name,
      userHash,
      body.error.category,
      body.error.severity,
      body.error.message,
      body.error.details || null,
      body.error.statusCode || null,
      body.error.requestPath || null,
      body.userDescription || null,
      JSON.stringify(body.environment),
      body.appVersion
    );

    console.debug(`[error-report] Stored in database: ${reportId}`);
  } catch (dbError) {
    console.error(`[error-report] Failed to store in database:`, dbError);
  }
}

async function notifyErrorReport(reportId: string, session: { user: { name?: string | null } }, body: ErrorReport): Promise<void> {
  try {
    const contact = getContactInfo();
    await sendErrorReportEmail({
      to: contact.email,
      reportId,
      userName: session.user.name || "Anonymous",
      error: body.error,
      userDescription: body.userDescription,
      environment: body.environment,
      appVersion: body.appVersion,
    });
    console.debug(`[error-report] Email sent successfully for report ${reportId}`);
  } catch (emailError) {
    console.error(`[error-report] Failed to send email for report ${reportId}:`, emailError);
  }
}

/**
 * POST /api/error-report
 * 
 * Receives error reports from the client and sends them via email.
 * Requires authentication to prevent abuse.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!isErrorReportingEnabled()) {
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

    if (!validateErrorReportPayload(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid error report" },
        { status: 400 }
      );
    }

    const reportId = buildReportId();
    logErrorReport(reportId, session, body);
    persistErrorReport(reportId, session, body);
    await notifyErrorReport(reportId, session, body);

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
