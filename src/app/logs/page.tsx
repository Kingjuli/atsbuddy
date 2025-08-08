"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type LogEntry = {
  ts?: string;
  level?: string;
  msg?: string;
  requestId?: string;
  [key: string]: unknown;
};

type ApiResponse = { ok: boolean; entries: LogEntry[]; error?: string };

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/logs");
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to fetch logs");
      setEntries(json.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch logs");
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <div className="flex gap-3 text-sm">
          <Link className="underline" href="/metrics">Metrics</Link>
          <Link className="underline" href="/admin">Admin</Link>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      <div className="mb-3">
        <button onClick={load} disabled={loading} className="px-3 py-2 rounded border border-foreground/20 text-sm">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="rounded border border-foreground/10 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-foreground/10">
              <th className="py-2 px-2">Time</th>
              <th className="px-2">Level</th>
              <th className="px-2">RequestId</th>
              <th className="px-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((e, i) => (
              <tr key={i} className="border-b border-foreground/10 align-top">
                <td className="py-2 px-2 whitespace-nowrap">{e.ts ? new Date(e.ts).toLocaleString() : "-"}</td>
                <td className="px-2 uppercase">{e.level || "-"}</td>
                <td className="px-2 truncate max-w-[160px]" title={e.requestId}>{e.requestId || "-"}</td>
                <td className="px-2">
                  <pre className="whitespace-pre-wrap text-xs">
                    {e.msg || JSON.stringify(e, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
