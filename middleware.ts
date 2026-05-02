import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth middleware — redirects unauthenticated users to login.
 * Checks for the httponly `auth_token` cookie set by the backend.
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token");

  // If no auth cookie and trying to access workspace, redirect to login
  if (!token) {
    const loginUrl = new URL("/", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Only protect workspace routes
export const config = {
  matcher: "/workspace/:path*",
};
