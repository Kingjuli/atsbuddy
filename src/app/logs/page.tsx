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

"use client";
import { useMemo, useState } from "react";

type LogEntry = {
  ts?: string;
  level?: string;
  msg?: string;
  requestId?: string;
  [key: string]: unknown;
};

export default function LogsPage() {
  const [pwd, setPwd] = useState("");
  const [requestId, setRequestId] = useState("");
  const [level, setLevel] = useState<string>("");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [mode, setMode] = useState<"requests" | "unattributed">("requests");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (mode === "unattributed") params.set("unattributed", "1");
      if (requestId.trim()) params.set("requestId", requestId.trim());
      if (level) params.append("level", level);
      params.set("limit", "300");
      const res = await fetch(`/api/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${pwd}` },
      });
      const json = (await res.json()) as { ok: boolean; entries?: LogEntry[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setEntries(json.entries || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to fetch");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  const grouped = useMemo(() => {
    if (mode === "unattributed") return { Unattributed: entries } as Record<string, LogEntry[]>;
    const map = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const id = String(e.requestId || "");
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(e);
    }
    return Object.fromEntries(map);
  }, [entries, mode]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-4">Logs</h1>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="Password"
          type="password"
          className="border rounded px-3 py-2 text-sm"
        />
        <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="border rounded px-2 py-2 text-sm">
          <option value="requests">Requests</option>
          <option value="unattributed">Unattributed</option>
        </select>
        <input
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          placeholder="Search by request id"
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[240px]"
        />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="border rounded px-2 py-2 text-sm">
          <option value="">All levels</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="debug">debug</option>
        </select>
        <button onClick={load} className="px-3 py-2 rounded bg-foreground text-background text-sm" disabled={loading}>
          {loading ? "Loading…" : "Load"}
        </button>
      </div>
      {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
      <div className="space-y-6">
        {Object.entries(grouped).map(([groupId, items]) => (
          <div key={groupId} className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">
                {mode === "unattributed" ? "Unattributed logs" : `Request ${groupId}`}
              </div>
              <div className="text-xs text-foreground/60">{items.length} entries</div>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-foreground/10">
                  <th className="py-2">Time</th>
                  <th>Level</th>
                  <th>Message</th>
                  <th>Fields</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e, i) => (
                  <tr key={i} className="border-b border-foreground/10 align-top">
                    <td className="py-2 whitespace-nowrap text-xs">{e.ts ? new Date(e.ts).toLocaleString() : "-"}</td>
                    <td className="whitespace-nowrap text-xs">{e.level}</td>
                    <td className="pr-2">{String(e.msg || "")}</td>
                    <td className="text-xs text-foreground/70">
                      <code className="break-all">
                        {JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !["ts", "level", "msg"].includes(k))), null, 0)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}


