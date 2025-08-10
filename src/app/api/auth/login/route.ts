import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createAuthToken, getCookieOptions } from "@/lib/auth";
import crypto from "node:crypto";

export async function POST(req: NextRequest) {
  // CSRF double-submit token: require header matches cookie
  const csrfHeader = req.headers.get("x-csrf-token");
  const csrfCookie = req.cookies.get("csrf_token")?.value;
  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return NextResponse.json({ ok: false, error: "Invalid CSRF token" }, { status: 403 });
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.METRICS_PASSWORD || "";
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  if (!password || password !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  const token = await createAuthToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, token, getCookieOptions());
  return res;
}

// Provide a CSRF token to clients (double-submit cookie)
export async function GET() {
  const tokenBytes = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.json({ ok: true, csrfToken: tokenBytes });
  res.cookies.set("csrf_token", tokenBytes, { httpOnly: false, sameSite: "lax", path: "/" });
  return res;
}


