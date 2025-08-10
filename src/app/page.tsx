"use client";
import { useMemo, useRef, useState } from "react";
import type { AnalysisResponse } from "@/lib/types";

type PendingState = {
  filename?: string;
  words?: number;
  preview?: string;
  pdfUrl?: string;
};

export default function Home() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobText, setJobText] = useState("");
  const [pending, setPending] = useState<PendingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canAnalyze = useMemo(() => !!resumeFile, [resumeFile]);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] || null;
    if (!file) return;
    const dt = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    handleFileChange(dt);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  async function loadSample() {
    try {
      const res = await fetch("/samples/senior_software_engineer_java_resume.pdf");
      const blob = await res.blob();
      const file = new File([blob], "sample_resume.pdf", { type: "application/pdf" });
      const dt = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(dt);
      setJobText(sampleJD);
    } catch (e) {
      setError("Failed to load sample resume");
    }
  }

  async function copyMarkdown() {
    if (!result?.ok) return;
    const md = toMarkdown(result);
    await navigator.clipboard.writeText(md);
  }

  function downloadMarkdown() {
    if (!result?.ok) return;
    const md = toMarkdown(result);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "atsbuddy-analysis.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const file = e.target.files?.[0] || null;
    setResumeFile(file);
    if (!file) {
      if (pending?.pdfUrl) URL.revokeObjectURL(pending.pdfUrl);
      setPending(null);
      return;
    }
    try {
      // For client-side preview only, read text for .txt. For other types, show filename.
      if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
        if (pending?.pdfUrl) URL.revokeObjectURL(pending.pdfUrl);
        const text = await file.text();
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        setPending({ filename: file.name, words, preview: text.slice(0, 800), pdfUrl: undefined });
      } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        if (pending?.pdfUrl) URL.revokeObjectURL(pending.pdfUrl);
        const url = URL.createObjectURL(file);
        setPending({ filename: file.name, words: undefined, preview: undefined, pdfUrl: url });
      } else {
        if (pending?.pdfUrl) URL.revokeObjectURL(pending.pdfUrl);
        setPending({ filename: file.name, words: undefined, preview: undefined, pdfUrl: undefined });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read file";
      setError(msg);
      setPending(null);
    }
  }

  async function analyze() {
    if (!resumeFile) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // If sample file is loaded, return predefined response without calling API
      if (pending?.filename === "sample_resume.pdf" || pending?.filename?.includes("senior_software_engineer_java_resume.pdf")) {
        await new Promise((r) => setTimeout(r, 1500));
        const sample: AnalysisResponse = {
          ok: true,
          requestId: "sample",
          data: {
            score: 78,
            highlights: [
              "Strong React/Node and TypeScript experience",
              "Cloud exposure (AWS)",
              "Led projects with measurable impact",
            ],
            missingKeywords: ["CI/CD", "Terraform", "Kubernetes"],
            rewriteBullets: [
              "Led migration to React 18, improving TTI by 35% and reducing bundle size 22%",
              "Designed Node.js message pipeline handling 5M events/day with <200ms p95",
              "Cut infra cost 18% by tuning PostgreSQL indexing and S3 lifecycle policies",
            ],
            atsAudit:
              "Use standard section headers (Experience, Education, Skills). Avoid multi-column layouts and images. Prefer single-column PDF or DOCX.",
            coverLetterTemplate:
              "Dear Hiring Manager,\n\nI’m excited to apply for the Senior Software Engineer role. I’ve shipped production features across React/Next.js and Node.js services, with a focus on performance, reliability, and developer experience. Recently, I led a React 18 migration improving TTI 35% and built a Node-based pipeline processing 5M events/day. I’m comfortable with AWS, CI/CD, and SQL performance tuning. I’d love to bring this impact to your team.\n\nBest regards,\n[Your Name]",
            generalGuidance:
              jobText
                ? "Emphasize JD keywords (React, Node.js, AWS, CI/CD). Quantify impact (latency, throughput, cost)."
                : "Tailor bullets to target role, quantify outcomes, and align skills to job requirements.",
            message: "ok",
          },
        };
        setResult(sample);
        return;
      }
      const form = new FormData();
      form.append("file", resumeFile);
      form.append("jobText", jobText);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const json: AnalysisResponse = await res.json();
      if (!json.ok) throw new Error(json.error || "Analysis failed");
      setResult(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    if (pending?.pdfUrl) URL.revokeObjectURL(pending.pdfUrl);
    setResumeFile(null);
    setPending(null);
    setJobText("");
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">ATSBuddy</h1>
          <p className="text-sm text-foreground/80 mt-1">
            Upload your resume, paste a job description (optional), and get
            concise, actionable feedback to win the interview.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="rounded-lg border border-foreground/10 p-4" onDrop={handleDrop} onDragOver={handleDragOver}>
            <h2 className="font-medium mb-3">1. Upload resume</h2>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-foreground file:text-background hover:file:bg-foreground/90"
            />
            <div className="flex items-center gap-2 mt-2">
              <button onClick={loadSample} className="px-2 py-1 rounded border border-foreground/20 text-xs">Load sample</button>
              <span className="text-xs text-foreground/60">or drag & drop a file above</span>
            </div>
            {pending && (
              <div className="mt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{pending.filename}</span>
                  {typeof pending.words === "number" && (
                    <span className="text-foreground/70">{pending.words} words</span>
                  )}
                </div>
                {pending.preview && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs bg-foreground/[0.04] rounded p-2">
                    {pending.preview}
                  </pre>
                )}
                  {pending.pdfUrl && (
                    <div className="mt-2 h-64 border border-foreground/10 rounded overflow-hidden">
                      <iframe
                        src={pending.pdfUrl}
                        className="w-full h-full"
                        title="PDF preview"
                      />
                    </div>
                  )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-foreground/10 p-4">
            <h2 className="font-medium mb-3">2. Paste job description (optional)</h2>
            <textarea
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Paste the JD here to assess keyword match and role fit. Leave empty to get general ATS feedback."
              rows={10}
              className="w-full rounded border border-foreground/10 bg-transparent p-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
            />
          </section>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            disabled={!canAnalyze || loading}
            onClick={analyze}
            className="h-10 px-4 rounded bg-foreground text-background text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Analyzing…" : "Analyze resume"}
          </button>
          <button
            onClick={resetAll}
            className="h-10 px-4 rounded border border-foreground/20 text-sm"
          >
            Reset
          </button>
          {!canAnalyze && (
            <span className="text-xs text-foreground/70">Upload a resume to continue</span>
          )}
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600">{error}</div>
        )}

        {result?.ok && (
          <section className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-lg border border-foreground/10 p-4 lg:col-span-1">
              <h3 className="font-medium mb-2">Score</h3>
              <Score value={result.data?.score ?? undefined} />
              <div className="mt-3 flex gap-2">
                <button onClick={copyMarkdown} className="px-3 py-1.5 rounded border border-foreground/20 text-xs">Copy as Markdown</button>
                <button onClick={downloadMarkdown} className="px-3 py-1.5 rounded border border-foreground/20 text-xs">Download .md</button>
              </div>
              {result.data?.highlights && result.data.highlights.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-1">Highlights</h4>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {result.data.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-foreground/10 p-4 lg:col-span-2">
              {result.data?.missingKeywords && result.data.missingKeywords.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Missing keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.data.missingKeywords.map((k, i) => (
                      <span key={i} className="inline-flex items-center rounded-full border border-foreground/20 px-2 py-0.5 text-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.data?.rewriteBullets && result.data.rewriteBullets.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Suggested bullet rewrites</h4>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {result.data.rewriteBullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {typeof result.data?.atsAudit !== "undefined" && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">ATS audit</h4>
                  <pre className="text-sm whitespace-pre-wrap bg-foreground/[0.04] rounded p-2">
                    {toText(result.data?.atsAudit)}
                  </pre>
                </div>
              )}

              {typeof result.data?.coverLetterTemplate !== "undefined" && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Cover letter scaffold</h4>
                  <pre className="text-sm whitespace-pre-wrap bg-foreground/[0.04] rounded p-2">
                    {toText(result.data?.coverLetterTemplate)}
                  </pre>
                </div>
              )}

              {typeof result.data?.generalGuidance !== "undefined" && (
                <div className="mb-2">
                  <h4 className="text-sm font-medium mb-1">General guidance</h4>
                  <pre className="text-sm whitespace-pre-wrap bg-foreground/[0.04] rounded p-2">
                    {toText(result.data?.generalGuidance)}
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="mt-10 text-xs text-foreground/60">
          We never store your files. All processing happens server-side during
          this session.
        </footer>
      </div>
    </div>
  );
}

function Score({ value }: { value: number | undefined }) {
  if (typeof value !== "number") {
    return <div className="text-sm text-foreground/70">No score yet</div>;
  }
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="h-2 bg-foreground/10 rounded overflow-hidden">
        <div
          className="h-full bg-foreground"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-sm">
        <span className="font-medium">{pct}</span>
        <span className="text-foreground/70"> / 100</span>
      </div>
    </div>
  );
}

function toText(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (Array.isArray(input)) return input.map((v) => toText(v)).join("\n");
  if (typeof input === "object") return JSON.stringify(input, null, 2);
  return String(input);
}

function toMarkdown(res: AnalysisResponse): string {
  const d = res.data || {} as any;
  const lines: string[] = [];
  lines.push(`# ATSBuddy Analysis`);
  if (typeof d.score === "number") lines.push(`\n**Score:** ${d.score}/100`);
  if (Array.isArray(d.highlights) && d.highlights.length) {
    lines.push(`\n## Highlights`);
    for (const h of d.highlights) lines.push(`- ${String(h)}`);
  }
  if (Array.isArray(d.missingKeywords) && d.missingKeywords.length) {
    lines.push(`\n## Missing keywords`);
    lines.push(d.missingKeywords.map((k: unknown) => ` ${String(k)} `).join(", ").replaceAll("\u0000", "`"));
  }
  if (Array.isArray(d.rewriteBullets) && d.rewriteBullets.length) {
    lines.push(`\n## Suggested bullet rewrites`);
    for (const b of d.rewriteBullets) lines.push(`- ${String(b)}`);
  }
  if (typeof d.atsAudit === "string" && d.atsAudit.trim()) {
    lines.push(`\n## ATS audit`);
    lines.push(d.atsAudit);
  }
  if (typeof d.coverLetterTemplate === "string" && d.coverLetterTemplate.trim()) {
    lines.push(`\n## Cover letter scaffold`);
    lines.push(d.coverLetterTemplate);
  }
  if (typeof d.generalGuidance === "string" && d.generalGuidance.trim()) {
    lines.push(`\n## General guidance`);
    lines.push(d.generalGuidance);
  }
  return lines.join("\n");
}

const sampleJD = `
Senior Software Engineer (Full‑Stack)

About the role
We’re building a modern web platform used by thousands of customers daily. You will design and ship end‑to‑end features across a React/Next.js frontend and Node.js APIs, working closely with design and product.

Responsibilities
- Build user‑facing features with React 18/Next.js and TypeScript
- Design and implement Node.js/TypeScript services and APIs
- Own quality: write tests, monitor performance, and optimize for reliability
- Collaborate on system design, code reviews, and incremental delivery

Minimum qualifications
- 5+ years building production web applications
- Strong with TypeScript, React, Node.js
- Experience with SQL databases (PostgreSQL or MySQL)
- Hands‑on with cloud platforms (AWS/GCP/Azure) and CI/CD

Nice to have
- Experience with Docker, Kubernetes, Terraform
- Observability (OpenTelemetry, Prometheus, Grafana)
- Performance tuning and cost optimization

Keywords: React, Next.js, TypeScript, Node.js, REST, PostgreSQL, AWS, Docker, CI/CD, system design.
`;
