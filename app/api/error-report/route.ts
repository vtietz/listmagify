import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { isContactConfigured, getContactInfo } from "@/lib/contact";
import { sendErrorReportEmail } from "@/lib/email";
import { getDb } from "@/lib/metrics/db";
import { hashUserId } from "@/lib/metrics/logger";
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

    // Log the report for console tracking
    console.log(`[error-report] Report ${reportId} received:`);
    console.log(`[error-report] Category: ${body.error.category}`);
    console.log(`[error-report] Message: ${body.error.message}`);
    console.log(`[error-report] Details: ${body.error.details || 'N/A'}`);
    console.log(`[error-report] User Description: ${body.userDescription || 'N/A'}`);
    
    // Store in a simple log file (could be replaced with DB storage)
    const logEntry = {
      reportId,
      timestamp: new Date().toISOString(),
      userId: session.user.id,
      userName: session.user.name,
      error: body.error,
      userDescription: body.userDescription,
      environment: body.environment,
    };
    
    // Log to console in structured format for easy parsing
    console.log(`[error-report] FULL_REPORT: ${JSON.stringify(logEntry)}`);

    // Store in database if metrics are enabled
    try {
      const db = getDb();
      if (db) {
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
        console.log(`[error-report] Stored in database: ${reportId}`);
      }
    } catch (dbError) {
      console.error(`[error-report] Failed to store in database:`, dbError);
      // Don't fail the request if DB storage fails
    }

    // Send email notification
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
      console.log(`[error-report] Email sent successfully for report ${reportId}`);
    } catch (emailError) {
      console.error(`[error-report] Failed to send email for report ${reportId}:`, emailError);
      // Don't fail the request if email fails
    }

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
