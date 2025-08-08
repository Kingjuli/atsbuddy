import { NextRequest, NextResponse } from "next/server";
import { loadLogs } from "@/lib/logReader";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId") || undefined;
  const unattributed = url.searchParams.get("unattributed") === "1";
  const limit = Math.min(1000, Math.max(10, Number(url.searchParams.get("limit") || 200)));
  const levels = url.searchParams.getAll("level");

  // Cookie-based auth; fallback to header password for first login
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const hasValidCookie = await verifyAuthToken(token);
  if (!hasValidCookie) {
    const pass = process.env.METRICS_PASSWORD || "";
    const authHeader = req.headers.get("authorization") || "";
    if (!pass || authHeader !== `Bearer ${pass}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const entries = await loadLogs({ requestId, unattributed, limit, levels: levels.length ? levels : undefined });
  const res = NextResponse.json({ ok: true, entries });
  if (!hasValidCookie) {
    try {
      const { createAuthToken, getCookieOptions } = await import("@/lib/auth");
      const newToken = await createAuthToken();
      res.cookies.set(AUTH_COOKIE_NAME, newToken, getCookieOptions());
    } catch {}
  }
  return res;
}


