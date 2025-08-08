// Minimal cookie-based auth for metrics access
// Uses HMAC-SHA256 to sign a short-lived token stored in an HttpOnly cookie

export const AUTH_COOKIE_NAME = "atsbuddy_auth";

type TokenPayload = {
  exp: number; // unix seconds
};

function getSecret(): string {
  const secret = process.env.METRICS_AUTH_SECRET || process.env.METRICS_PASSWORD;
  if (!secret) {
    throw new Error("Missing METRICS_AUTH_SECRET or METRICS_PASSWORD env var");
  }
  return secret;
}

function toBase64Url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== "undefined" ? btoa(str) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
  const normalized = b64 + pad;
  const bin = typeof atob !== "undefined" ? atob(normalized) : Buffer.from(normalized, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign", "verify"]
  );
}

async function hmacSHA256(data: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(signature);
}

export async function createAuthToken(ttlSeconds = 60 * 60 * 24 * 7): Promise<string> {
  const payload: TokenPayload = { exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = toBase64Url(payloadStr);
  const sig = await hmacSHA256(payloadB64, getSecret());
  return `${payloadB64}.${sig}`;
}

export async function verifyAuthToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  // verify signature
  let expected: string;
  try {
    expected = await hmacSHA256(payloadB64, getSecret());
  } catch {
    return false;
  }
  if (sig !== expected) return false;
  // verify expiry
  try {
    const payloadBytes = fromBase64Url(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload: TokenPayload = JSON.parse(payloadStr);
    if (typeof payload.exp !== "number") return false;
    const now = Math.floor(Date.now() / 1000);
    return now < payload.exp;
  } catch {
    return false;
  }
}

export function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
}


