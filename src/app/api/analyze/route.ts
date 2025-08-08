export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractTextFromFile } from "@/lib/parse";
import crypto from "node:crypto";
import { AIManager } from "@/lib/aiManager";
import { logger } from "@/lib/logger";

const AnalyzeSchema = z.object({
  resumeText: z.string().min(50, "Resume text seems too short; upload a real resume."),
  jobText: z.string().optional().default(""),
  meta: z
    .object({ filename: z.string().optional(), wordCount: z.number().optional() })
    .optional(),
});

// Lazy-initialize the OpenAI client inside the handler to avoid build-time env access

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const contentType = req.headers.get("content-type") || "";
  logger.info("analyze.start", { requestId, endpoint: "/api/analyze", contentType });
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
      model: "gpt-5-nano",
      temperature: 1,
      maxOutputTokens: 5000,
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
    const responseMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, requestId, error: responseMessage },
      { status: 400, headers: { "x-request-id": requestId } }
    );
  }
}


