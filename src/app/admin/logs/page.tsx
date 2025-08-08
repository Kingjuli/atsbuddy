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
      const res = await fetch(`/api/logs?${params.toString()}`);
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
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <button onClick={load} className="px-3 py-2 rounded border border-foreground/20 text-sm" disabled={loading}>
          {loading ? "Loading…" : "Load"}
        </button>
      </div>
      {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
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
      </div>
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
                        {JSON.stringify(
                          Object.fromEntries(Object.entries(e).filter(([k]) => !["ts", "level", "msg"].includes(k))),
                          null,
                          0
                        )}
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


