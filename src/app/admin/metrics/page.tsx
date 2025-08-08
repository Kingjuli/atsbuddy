"use client";
import { useEffect, useMemo, useState } from "react";
import { copyToClipboard, formatCurrency, formatNumber, shortenId, type SupportedCurrency } from "@/lib/format";

type Metric = {
  timestamp: number;
  requestId?: string;
  endpoint?: string;
  model: string;
  serviceTier?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number;
  costUSD?: number;
};

type ApiResponse = {
  ok: boolean;
  metrics: Metric[];
  totals: { totalCost: number; totalRequests: number; totalInput: number; totalCachedInput: number; totalOutput: number };
};

export default function MetricsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelFilter, setModelFilter] = useState<string>("");
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/metrics");
      const json = (await res.json()) as ApiResponse & { error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to fetch");
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to fetch");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueModels = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>();
    for (const m of data.metrics) {
      if (m.model) s.add(m.model);
    }
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [] as Metric[];
    if (!modelFilter) return data.metrics;
    return data.metrics.filter((m) => m.model === modelFilter);
  }, [data, modelFilter]);

  const agg = useMemo(() => {
    let totalCost = 0;
    let totalRequests = 0;
    let totalInput = 0;
    let totalCachedInput = 0;
    let totalOutput = 0;
    let latencySum = 0;
    let latencyCount = 0;
    for (const m of filtered) {
      totalRequests += 1;
      totalCost += m.costUSD || 0;
      totalInput += m.inputTokens || 0;
      totalCachedInput += m.cachedInputTokens || 0;
      totalOutput += m.outputTokens || 0;
      if (typeof m.latencyMs === "number") {
        latencySum += m.latencyMs;
        latencyCount += 1;
      }
    }
    const avgLatencyMs = latencyCount ? Math.round(latencySum / latencyCount) : 0;
    return { totalCost, totalRequests, totalInput, totalCachedInput, totalOutput, avgLatencyMs };
  }, [filtered]);

  const totalCost = agg.totalCost;
  const totalReq = agg.totalRequests;

  async function copyRequestId(id?: string) {
    if (!id) return;
    try {
      await copyToClipboard(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // noop
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Metrics</h1>
        <div className="flex items-center gap-2">
          {data && (
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="px-2 py-2 rounded border border-foreground/20 text-sm bg-background"
              title="Filter by model"
            >
              <option value="">All models</option>
              {uniqueModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "USD" | "KES")}
            className="px-2 py-2 rounded border border-foreground/20 text-sm bg-background"
            title="Currency"
          >
            <option value="USD">USD</option>
            <option value="KES">KES</option>
          </select>
          <button onClick={load} disabled={loading} className="px-3 py-2 rounded border border-foreground/20 text-sm">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
      {data && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Stat label="Total spend" value={formatCurrency(totalCost, currency)} />
            <Stat label="Requests" value={String(totalReq)} />
            <Stat label="Input tokens" value={formatNumber(agg.totalInput)} />
            <Stat label="Output tokens" value={formatNumber(agg.totalOutput)} />
            <Stat label="Avg latency" value={`${formatNumber(agg.avgLatencyMs)}ms`} />
          </div>
          <div className="rounded border border-foreground/10 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-foreground/10">
                  <th className="py-2 px-2">Time</th>
                  <th className="px-2">Endpoint</th>
                  <th className="px-2">Model</th>
                  <th className="px-2">Tier</th>
                  <th className="px-2">In</th>
                  <th className="px-2">Cached</th>
                  <th className="px-2">Out</th>
                  <th className="px-2">Total</th>
                  <th className="px-2">Latency</th>
                  <th className="px-2">Cost</th>
                  <th className="px-2">ReqId</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={i} className="border-b border-foreground/10">
                    <td className="py-2 px-2 whitespace-nowrap">{new Date(m.timestamp).toLocaleString()}</td>
                    <td className="px-2">{m.endpoint || "-"}</td>
                    <td className="px-2">{m.model}</td>
                    <td className="px-2">{m.serviceTier || "-"}</td>
                    <td className="px-2">{formatNumber(m.inputTokens ?? 0)}</td>
                    <td className="px-2">{formatNumber(m.cachedInputTokens ?? 0)}</td>
                    <td className="px-2">{formatNumber(m.outputTokens ?? 0)}</td>
                    <td className="px-2">{formatNumber(m.totalTokens ?? 0)}</td>
                    <td className="px-2">{(m.latencyMs ?? 0).toLocaleString()}ms</td>
                    <td className="px-2">{formatCurrency(m.costUSD ?? 0, currency)}</td>
                    <td className="px-2 max-w-[220px]" title={m.requestId}>
                      {m.requestId ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs">{shortenId(m.requestId)}</code>
                          <button
                            onClick={() => copyRequestId(m.requestId)}
                            className="text-xs px-2 py-1 rounded border border-foreground/20 hover:bg-foreground/5"
                            aria-label="Copy request id"
                          >
                            {copiedId === m.requestId ? "Copied" : "Copy"}
                          </button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-foreground/10 p-3">
      <div className="text-xs text-foreground/70">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}


