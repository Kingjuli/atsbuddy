import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractTextFromFile } from "@/lib/parsers/fileText";
import crypto from "node:crypto";
import { AIManager } from "@/lib/ai/manager";
import { logger } from "@/lib/logging/logger";
import { Redis } from "@upstash/redis";

const AnalyzeSchema = z.object({
  resumeText: z.string().min(50, "Resume text seems too short; upload a real resume."),
  jobText: z.string().optional().default(""),
  meta: z
    .object({ filename: z.string().optional(), wordCount: z.number().optional() })
    .optional(),
});

// Force Node.js runtime and dynamic evaluation (uses node:crypto, file parsing)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allow preflight in case a browser issues OPTIONS before POST
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      // Removed permissive CORS origin wildcard
    },
  });
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const contentType = req.headers.get("content-type") || "";
  logger.info("analyze.start", { requestId, endpoint: "/api/analyze", contentType });
  // Basic IP-based rate limiting (sliding window via Redis; in-memory fallback)
  try {
    const windowSeconds = Number(process.env.RATE_WINDOW_SECONDS || 60);
    const maxInWindow = Number(process.env.RATE_MAX || 20);
    const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const ip = xff || req.headers.get("x-real-ip") || "unknown";
    const key = `ratelimit:analyze:${ip}`;
    try {
      const redis = Redis.fromEnv();
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      const ttl = await redis.ttl(key);
      if (count > maxInWindow) {
        const retryAfter = Math.max(1, ttl);
        logger.warn("analyze.rate_limited", { requestId, ip, retryAfterSeconds: retryAfter });
        return NextResponse.json(
          { ok: false, requestId, error: "Rate limit exceeded. Please retry later." },
          { status: 429, headers: { "x-request-id": requestId, "retry-after": String(retryAfter) } }
        );
      }
    } catch {
      // In-memory fallback (best-effort, per-process)
      const now = Date.now();
      const end = now + windowSeconds * 1000;
      // @ts-expect-error attach ephemeral map on globalThis
      globalThis.__rate__ = globalThis.__rate__ || new Map<string, { n: number; resetAt: number }>();
      // @ts-expect-error see above
      const entry = globalThis.__rate__.get(key) || { n: 0, resetAt: end };
      if (entry.resetAt < now) {
        entry.n = 0;
        entry.resetAt = end;
      }
      entry.n += 1;
      // @ts-expect-error see above
      globalThis.__rate__.set(key, entry);
      if (entry.n > maxInWindow) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        logger.warn("analyze.rate_limited", { requestId, ip, retryAfterSeconds: retryAfter });
        return NextResponse.json(
          { ok: false, requestId, error: "Rate limit exceeded. Please retry later." },
          { status: 429, headers: { "x-request-id": requestId, "retry-after": String(retryAfter) } }
        );
      }
    }
  } catch {}
  try {
    let resumeText = "";
    let jobText = "";
    let meta: { filename?: string; wordCount?: number } | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const jd = form.get("jobText");
      if (!(file instanceof File)) {
        const durationMs = Date.now() - startedAt;
        logger.warn("analyze.error", { requestId, durationMs, error: "Missing resume file" });
        return NextResponse.json(
          { ok: false, error: "Missing resume file" },
          { status: 400 }
        );
      }
      const extracted = await extractTextFromFile(file);
      resumeText = extracted.text;
      jobText = typeof jd === "string" ? jd : "";
      meta = { filename: extracted.meta.filename, wordCount: extracted.meta.wordCount };
      // validate
      AnalyzeSchema.parse({ resumeText, jobText, meta });
    } else {
      const body = await req.json();
      const parsed = AnalyzeSchema.parse(body);
      resumeText = parsed.resumeText;
      jobText = parsed.jobText || "";
      meta = parsed.meta;
    }

    const system = `You are an expert technical recruiter and resume optimizer who knows ATS parsing behavior across major systems (Workday, Greenhouse, Lever, iCIMS, Taleo).
    Return ONLY JSON per the provided schema. Be concise and avoid repetition while remaining actionable.
    Tasks:
    1) Score resume vs job (if job provided) across: keyword match, seniority fit, core skills, domain experience, location, education, and resume clarity. 0-100.
    2) Extract missing but critical keywords from the job and suggest precise resume edits.
    3) Suggest 3-5 quantified bullet rewrites using strong impact verbs tailored to the target role.
    4) Provide an ATS-readability audit (sections, formatting, parse risks).
    5) Provide a short cover letter scaffold (5-7 sentences) that mirrors keywords without fluff.
    6) If job is missing, include generalGuidance suitable across roles.`;

    const user = JSON.stringify({ resume: resumeText, job: jobText || null, meta: meta || {} });

    // Responses API with structured output and conservative decoding to control cost
    const jsonSchema = {
      name: "Analysis",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          score: { type: "number", minimum: 0, maximum: 100 },
          highlights: {
            type: "array",
            items: { type: "string" },
          },
          missingKeywords: {
            type: "array",
            items: { type: "string" },
          },
          rewriteBullets: {
            type: "array",
            items: { type: "string" },
          },
          atsAudit: { type: "string" },
          coverLetterTemplate: { type: "string" },
          generalGuidance: { type: "string" },
          message: { type: "string" },
        },
        required: [
          "score",
          "highlights",
          "missingKeywords",
          "rewriteBullets",
          "atsAudit",
          "coverLetterTemplate",
          "generalGuidance",
          "message",
        ],
      },
      strict: true,
    } as const;

    const ai = new AIManager(process.env.OPENAI_API_KEY);
    const data = await ai.createTextJsonResponse({
      system,
      user,
      schema: jsonSchema,
      // model picked from env in AIManager
      temperature: 1,
      maxOutputTokens: 10000,
      requestId,
      metadata: { endpoint: "analyze" },
    });
    const durationMs = Date.now() - startedAt;
    const filename = meta?.filename;
    const wordCount = meta?.wordCount;
    const jobTextLength = jobText.length;
    const resumeChars = resumeText.length;
    logger.info("analyze.finish", {
      requestId,
      endpoint: "/api/analyze",
      durationMs,
      ok: true,
      filename,
      wordCount,
      jobTextLength,
      resumeChars
    });
    return NextResponse.json(
      { ok: true, requestId, data },
      { headers: { "x-request-id": requestId } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startedAt;
    logger.error("analyze.error", { requestId, endpoint: "/api/analyze", durationMs, error: message });
    return NextResponse.json(
      { ok: false, requestId, error: "Unexpected server error" },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}


