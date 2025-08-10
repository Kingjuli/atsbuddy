export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getMetricsAsync, getTotalsAsync, getMetricsPage } from "@/lib/metrics/index";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";
import crypto from "node:crypto";
import { logger } from "@/lib/logging/logger";

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  logger.info("metrics.start", { requestId, endpoint: "/api/metrics" });
  // Accept either cookie token or initial password via Authorization
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const hasValidCookie = await verifyAuthToken(token);
  if (!hasValidCookie) {
    const authHeader = req.headers.get("authorization") || "";
    const pass = process.env.METRICS_PASSWORD || "";
    if (!pass || authHeader !== `Bearer ${pass}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: { "x-request-id": requestId } }
      );
    }
  }
  // Pagination and optional filters
  const url = new URL(req.url);
  const limit = Math.min(1000, Math.max(10, Number(url.searchParams.get("limit") || 200)));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam ? Math.max(0, Number(cursorParam)) : 0;
  const model = url.searchParams.get("model") || undefined;
  const endpoint = url.searchParams.get("endpoint") || undefined;
  const { metrics, nextCursor } = await getMetricsPage({ limit, cursor, model, endpoint, maxBytes: 700_000 });
  const totals = await getTotalsAsync();
  const durationMs = Date.now() - startedAt;
  logger.info("metrics.finish", { requestId, endpoint: "/api/metrics", durationMs, count: metrics.length });
  const res = NextResponse.json({ ok: true, metrics, totals, nextCursor, limit, cursor }, { headers: { "x-request-id": requestId } });
  // If header auth used and cookie missing, set cookie for subsequent requests
  if (!hasValidCookie) {
    try {
      const { createAuthToken, getCookieOptions } = await import("@/lib/auth");
      const newToken = await createAuthToken();
      res.cookies.set(AUTH_COOKIE_NAME, newToken, getCookieOptions());
    } catch (e) {
      console.error("/api/metrics: failed to set auth cookie", e);
    }
  }
  return res;
}


