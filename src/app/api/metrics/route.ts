import { NextRequest, NextResponse } from "next/server";
import { getMetrics, getTotals } from "@/lib/metrics";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  // Accept either cookie token or initial password via Authorization
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const hasValidCookie = await verifyAuthToken(token);
  if (!hasValidCookie) {
    const authHeader = req.headers.get("authorization") || "";
    const pass = process.env.METRICS_PASSWORD || "";
    if (!pass || authHeader !== `Bearer ${pass}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }
  const metrics = getMetrics();
  const totals = getTotals();
  const res = NextResponse.json({ ok: true, metrics, totals });
  // If header auth used and cookie missing, set cookie for subsequent requests
  if (!hasValidCookie) {
    try {
      const { createAuthToken, getCookieOptions } = await import("@/lib/auth");
      const newToken = await createAuthToken();
      res.cookies.set(AUTH_COOKIE_NAME, newToken, getCookieOptions());
    } catch {}
  }
  return res;
}


