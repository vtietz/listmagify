import { NextResponse } from "next/server";

/**
 * Test login endpoint for E2E testing.
 * Only available when E2E_MODE=1.
 * Sets a test session cookie to bypass real OAuth.
 */
export async function GET() {
  if (process.env.E2E_MODE !== '1') {
    return NextResponse.json(
      { error: "Test endpoint only available in E2E mode" },
      { status: 403 }
    );
  }

  // In E2E mode, middleware bypasses auth checks
  // This endpoint is just for explicit test flows that need a "login" action
  return NextResponse.json({
    message: "E2E mode active - auth bypassed",
    user: {
      id: "testuser",
      email: "test@example.com",
      name: "Test User"
    }
  });
}
