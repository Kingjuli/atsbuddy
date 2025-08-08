import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getCookieOptions } from "@/lib/auth";

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const opts = getCookieOptions();
  res.cookies.set(AUTH_COOKIE_NAME, "", { ...opts, maxAge: 0 });
  return res;
}


