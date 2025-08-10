"use client";
import { useEffect, useMemo, useState } from "react";
import { copyToClipboard, shortenId } from "@/lib/format";

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
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [mode, setMode] = useState<"requests" | "unattributed">("requests");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState<number>(300);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (mode === "unattributed") params.set("unattributed", "1");
      if (mode !== "unattributed" && requestId.trim()) params.set("requestId", requestId.trim());
      if (level) params.append("level", level);
      params.set("limit", String(limit));
      const res = await fetch(`/api/logs?${params.toString()}`);
      const json = (await res.json()) as { ok: boolean; entries?: LogEntry[]; nextCursor?: number | null; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setEntries(json.entries || []);
      setNextCursor(json.nextCursor ?? null);
    } catch (e) {
      console.error("LogsPage.load error", e);
      setErr(e instanceof Error ? e.message : "Failed to fetch");
      setEntries([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (nextCursor == null) return;
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (mode === "unattributed") params.set("unattributed", "1");
      if (mode !== "unattributed" && requestId.trim()) params.set("requestId", requestId.trim());
      if (level) params.append("level", level);
      params.set("limit", String(limit));
      params.set("cursor", String(nextCursor));
      const res = await fetch(`/api/logs?${params.toString()}`);
      const json = (await res.json()) as { ok: boolean; entries?: LogEntry[]; nextCursor?: number | null; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setEntries((prev) => [...prev, ...(json.entries || [])]);
      setNextCursor(json.nextCursor ?? null);
    } catch (e) {
      console.error("LogsPage.loadMore error", e);
      setErr(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Clear requestId when switching to unattributed to avoid conflicting filters
    if (mode === "unattributed" && requestId) setRequestId("");
    // Auto-load on mode switch for clarity
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      load();
    }, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, mode, level, limit, requestId]);

  const filteredEntries = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter((e) => {
      if (String(e.msg || "").toLowerCase().includes(q)) return true;
      try {
        const obj = Object.fromEntries(Object.entries(e).filter(([k]) => !["ts", "level", "msg"].includes(k)));
        return JSON.stringify(obj).toLowerCase().includes(q);
      } catch (err) {
        console.error("LogsPage.filteredEntries JSON error", err);
        return false;
      }
    });
  }, [entries, query]);

  const grouped = useMemo(() => {
    if (mode === "unattributed") return { Unattributed: filteredEntries } as Record<string, LogEntry[]>;
    const map = new Map<string, LogEntry[]>();
    for (const e of filteredEntries) {
      const id = String(e.requestId || "");
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(e);
    }
    return Object.fromEntries(map);
  }, [filteredEntries, mode]);

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const isExpanded = prev[id] ?? true;
      return { ...prev, [id]: !isExpanded };
    });
  }

  function setAllGroups(expand: boolean) {
    const next: Record<string, boolean> = {};
    for (const id of Object.keys(grouped)) next[id] = expand;
    setExpandedGroups(next);
  }

  function downloadGroup(id: string, items: LogEntry[]) {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function levelBadgeClass(lvl?: string) {
    switch (lvl) {
      case "error":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "warn":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "debug":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (10s)
          </label>
          <button onClick={load} className="px-3 py-2 rounded border border-foreground/20 text-sm" disabled={loading}>
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
      </div>
      {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select value={mode} onChange={(e) => setMode(e.target.value as "requests" | "unattributed")} className="border rounded px-2 py-2 text-sm">
          <option value="requests">Requests</option>
          <option value="unattributed">Unattributed</option>
        </select>
        <input
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          placeholder="Search by request id"
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[240px] disabled:opacity-60"
          disabled={mode === "unattributed"}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by message or fields"
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[240px]"
        />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="border rounded px-2 py-2 text-sm">
          <option value="">All levels</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="debug">debug</option>
        </select>
        <select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} className="border rounded px-2 py-2 text-sm">
          {[100, 200, 300, 500, 800, 1000].map((n) => (
            <option key={n} value={n}>{n} limit</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button onClick={() => setAllGroups(true)} className="px-2 py-2 rounded border border-foreground/20">Expand all</button>
          <button onClick={() => setAllGroups(false)} className="px-2 py-2 rounded border border-foreground/20">Collapse all</button>
        </div>
      </div>
      <div className="space-y-6">
        {Object.entries(grouped).map(([groupId, items]) => (
          <div key={groupId} className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm flex items-center gap-3">
                {mode === "unattributed" ? (
                  <span>Unattributed logs</span>
                ) : (
                  <span className="flex items-center gap-2">
                    Request <code className="text-xs">{shortenId(groupId)}</code>
                    <button className="text-xs px-2 py-1 rounded border border-foreground/20" onClick={() => copyToClipboard(groupId)}>Copy</button>
                  </span>
                )}
                <button
                  className="text-xs px-2 py-1 rounded border border-foreground/20"
                  onClick={() => toggleGroup(groupId)}
                >
                  {(expandedGroups[groupId] ?? true) ? "Collapse" : "Expand"}
                </button>
                <button
                  className="text-xs px-2 py-1 rounded border border-foreground/20"
                  onClick={() => downloadGroup(groupId, items)}
                >
                  Download JSON
                </button>
              </div>
              <div className="text-xs text-foreground/60">{items.length} entries</div>
            </div>
            {(expandedGroups[groupId] ?? true) ? (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-foreground/10 sticky top-0 bg-background">
                    <th className="py-2">Time</th>
                    <th>Level</th>
                    <th>Message</th>
                    <th>Fields</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e, i) => (
                    <tr key={i} className="border-b border-foreground/10 align-top">
                      <td className="py-2 whitespace-nowrap text-xs" title={e.ts}>{e.ts ? new Date(e.ts).toLocaleString() : "-"}</td>
                      <td className="whitespace-nowrap text-xs">
                        <span className={`px-2 py-0.5 rounded ${levelBadgeClass(String(e.level))}`}>{e.level}</span>
                      </td>
                      <td className="pr-2">{String(e.msg || "")}</td>
                      <td className="text-xs text-foreground/70">
                        <details>
                          <summary className="cursor-pointer select-none text-foreground/80">View</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(
                            Object.fromEntries(Object.entries(e).filter(([k]) => !["ts", "level", "msg"].includes(k))),
                            null,
                            2
                          )}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-2 text-xs text-foreground/60">Group collapsed</div>
            )}
          </div>
        ))}
        <div className="flex justify-center pt-2">
          {nextCursor != null && (
            <button onClick={loadMore} className="px-3 py-2 rounded border border-foreground/20 text-sm" disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


