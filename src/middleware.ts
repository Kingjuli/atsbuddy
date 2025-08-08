import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";

const PROTECTED_PATHS = ["/metrics", "/api/metrics", "/logs", "/api/logs", "/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const shouldProtect = PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!shouldProtect) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const valid = await verifyAuthToken(token);
  if (valid) return NextResponse.next();

  // For API, return 401 JSON; for pages, redirect to /login with callback
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("callback", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/metrics",
    "/metrics/:path*",
    "/api/metrics",
    "/logs",
    "/logs/:path*",
    "/api/logs",
    "/admin",
    "/admin/:path*",
  ],
};


