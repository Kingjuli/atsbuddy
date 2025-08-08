"use client";
import { useEffect, useState } from "react";

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

  const totalCost = data?.totals.totalCost ?? 0;
  const totalReq = data?.totals.totalRequests ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Metrics</h1>
        <button onClick={load} disabled={loading} className="px-3 py-2 rounded border border-foreground/20 text-sm">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
      {data && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Total spend" value={`$${totalCost.toFixed(6)}`} />
            <Stat label="Requests" value={String(totalReq)} />
            <Stat label="Input tokens" value={String(data.totals.totalInput)} />
            <Stat label="Output tokens" value={String(data.totals.totalOutput)} />
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
                {data.metrics.map((m, i) => (
                  <tr key={i} className="border-b border-foreground/10">
                    <td className="py-2 px-2 whitespace-nowrap">{new Date(m.timestamp).toLocaleString()}</td>
                    <td className="px-2">{m.endpoint || "-"}</td>
                    <td className="px-2">{m.model}</td>
                    <td className="px-2">{m.serviceTier || "-"}</td>
                    <td className="px-2">{m.inputTokens ?? 0}</td>
                    <td className="px-2">{m.cachedInputTokens ?? 0}</td>
                    <td className="px-2">{m.outputTokens ?? 0}</td>
                    <td className="px-2">{m.totalTokens ?? 0}</td>
                    <td className="px-2">{(m.latencyMs ?? 0)}ms</td>
                    <td className="px-2">${(m.costUSD ?? 0).toFixed(6)}</td>
                    <td className="px-2 truncate max-w-[140px]" title={m.requestId}>{m.requestId}</td>
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


