export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { extractTextFromFile } from "@/lib/parse";

const AnalyzeSchema = z.object({
  resumeText: z.string().min(50, "Resume text seems too short; upload a real resume."),
  jobText: z.string().optional().default(""),
  meta: z
    .object({ filename: z.string().optional(), wordCount: z.number().optional() })
    .optional(),
});

// Lazy-initialize the OpenAI client inside the handler to avoid build-time env access

export async function POST(req: NextRequest) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const contentType = req.headers.get("content-type") || "";
    let resumeText = "";
    let jobText = "";
    let meta: { filename?: string; wordCount?: number } | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const jd = form.get("jobText");
      if (!(file instanceof File)) {
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

    const system = `You are an expert technical recruiter and resume optimizer who knows ATS parsing behavior across major systems (Workday, Greenhouse, Lever, iCIMS, Taleo). You will:
    1) Score resume vs job (if job provided) across: keyword match, seniority fit, core skills, domain experience, location, education, and resume clarity. 0-100.
    2) Extract missing but critical keywords from the job and suggest precise resume edits.
    3) Suggest 3-5 quantified bullet rewrites using strong impact verbs tailored to the target role.
    4) Provide an ATS-readability audit (sections, formatting, parse risks). Keep it concise and actionable.
    5) Provide a short cover letter scaffold (5-7 sentences) that mirrors keywords without fluff.
    Return JSON with keys: score, highlights[], missingKeywords[], rewriteBullets[], atsAudit, coverLetterTemplate, and if job missing, generalGuidance.`;

    const user = JSON.stringify({ resume: resumeText, job: jobText || null, meta: meta || {} });

    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 1,
    });

    // Try to parse model output as JSON. If not, wrap it.
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    console.error("/api/analyze error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}


