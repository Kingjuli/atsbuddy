"use client";
import { useMemo, useRef, useState } from "react";
import type { AnalysisResponse } from "@/lib/types";

type PendingState = {
  filename?: string;
  words?: number;
  preview?: string;
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const file = e.target.files?.[0] || null;
    setResumeFile(file);
    if (!file) {
      setPending(null);
      return;
    }
    try {
      // For client-side preview only, read text for .txt. For other types, show filename.
      if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
        const text = await file.text();
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        setPending({ filename: file.name, words, preview: text.slice(0, 800) });
      } else {
        setPending({ filename: file.name, words: undefined, preview: undefined });
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
          <section className="rounded-lg border border-foreground/10 p-4">
            <h2 className="font-medium mb-3">1. Upload resume</h2>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-foreground file:text-background hover:file:bg-foreground/90"
            />
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
