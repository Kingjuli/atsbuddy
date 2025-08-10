import { getListStore } from "@/lib/storage";

export type MetricRecord = {
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

const MAX_RECORDS = 500;
const METRICS_KEY = "atsbuddy:metrics";

export function recordMetric(rec: MetricRecord) {
  (async () => {
    try {
      const store = getListStore();
      await store.push(METRICS_KEY, JSON.stringify(rec));
      await store.trimToLast(METRICS_KEY, MAX_RECORDS);
    } catch {
      // ignore write errors
    }
  })();
}

export async function getMetricsAsync(): Promise<MetricRecord[]> {
  const store = getListStore();
  const items = await store.range(METRICS_KEY, -MAX_RECORDS, -1);
  const parsed: MetricRecord[] = [];
  for (const s of items) {
    try { parsed.push(JSON.parse(s) as MetricRecord); } catch {}
  }
  return parsed.reverse();
}

export async function getTotalsAsync() {
  const items = await getMetricsAsync();
  let totalCost = 0, totalRequests = 0, totalInput = 0, totalCachedInput = 0, totalOutput = 0;
  for (const m of items) {
    totalRequests += 1;
    totalCost += m.costUSD || 0;
    totalInput += m.inputTokens || 0;
    totalCachedInput += m.cachedInputTokens || 0;
    totalOutput += m.outputTokens || 0;
  }
  return { totalCost, totalRequests, totalInput, totalCachedInput, totalOutput };
}


