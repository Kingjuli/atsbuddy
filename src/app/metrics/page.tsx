"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const router = useRouter();
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
    // Try loading on mount using cookie if present
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCost = data?.totals.totalCost ?? 0;
  const totalReq = data?.totals.totalRequests ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Metrics</h1>
          <div className="text-sm">
            <Link className="underline" href="/logs">Logs</Link>
            <span className="px-2 text-foreground/40">·</span>
            <Link className="underline" href="/admin">Admin</Link>
          </div>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            setData(null);
            setErr(null);
            router.replace("/login?callback=/metrics");
          }}
          className="px-3 py-2 rounded border border-foreground/20 text-sm"
        >
          Logout
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
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-foreground/10">
                <th className="py-2">Time</th>
                <th>Endpoint</th>
                <th>Model</th>
                <th>Tier</th>
                <th>In</th>
                <th>Cached</th>
                <th>Out</th>
                <th>Total</th>
                <th>Latency</th>
                <th>Cost</th>
                <th>ReqId</th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m, i) => (
                <tr key={i} className="border-b border-foreground/10">
                  <td className="py-2">{new Date(m.timestamp).toLocaleString()}</td>
                  <td>{m.endpoint || "-"}</td>
                  <td>{m.model}</td>
                  <td>{m.serviceTier || "-"}</td>
                  <td>{m.inputTokens ?? 0}</td>
                  <td>{m.cachedInputTokens ?? 0}</td>
                  <td>{m.outputTokens ?? 0}</td>
                  <td>{m.totalTokens ?? 0}</td>
                  <td>{(m.latencyMs ?? 0)}ms</td>
                  <td>${(m.costUSD ?? 0).toFixed(6)}</td>
                  <td className="truncate max-w-[140px]" title={m.requestId}>{m.requestId}</td>
                </tr>
              ))}
            </tbody>
          </table>
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


