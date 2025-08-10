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

/**
 * recordMetric appends a metric record to persistence.
 * Example:
 *   recordMetric({ timestamp: Date.now(), model: "gpt-5-nano", costUSD: 0.00012 });
 */
export function recordMetric(rec: MetricRecord) {
  (async () => {
    try {
      const store = getListStore("metrics");
      await store.push(METRICS_KEY, JSON.stringify(rec));
      await store.trimToLast(METRICS_KEY, MAX_RECORDS);
    } catch (e) {
      console.error("metrics.recordMetric: failed to persist", e);
    }
  })();
}

/**
 * getMetricsAsync returns the most recent metric records.
 * Example:
 *   const rows = await getMetricsAsync();
 */
export async function getMetricsAsync(): Promise<MetricRecord[]> {
  const store = getListStore("metrics");
  const items = await store.range(METRICS_KEY, -MAX_RECORDS, -1);
  const parsed: MetricRecord[] = [];
  for (const s of items as Array<unknown>) {
    try {
      if (s && typeof s === "object") {
        parsed.push(s as MetricRecord);
      } else {
        parsed.push(JSON.parse(String(s)) as MetricRecord);
      }
    } catch (e) {
      console.error("metrics.getMetricsAsync: parse error", e);
    }
  }
  return parsed.reverse();
}

function parseMetricLines(lines: Array<unknown>): MetricRecord[] {
  const out: MetricRecord[] = [];
  for (const raw of lines) {
    if (raw && typeof raw === "object") {
      out.push(raw as MetricRecord);
      continue;
    }
    try {
      const obj = JSON.parse(String(raw));
      if (obj && typeof obj === "object") out.push(obj as MetricRecord);
    } catch (e) {
      console.error("metrics.parseMetricLines: parse error", e);
    }
  }
  return out;
}

export async function getMetricsPage(params: {
  limit?: number;
  cursor?: number; // number of tail items already paged through
  maxBytes?: number; // soft cap on total serialized bytes
  model?: string;
  endpoint?: string;
}): Promise<{ metrics: MetricRecord[]; nextCursor: number | null }>
{
  const pageLimit = Math.min(MAX_RECORDS, Math.max(10, params.limit ?? 100));
  let cursor = Math.max(0, Math.floor(params.cursor ?? 0));
  const store = getListStore("metrics");
  const byteBudget = Math.max(64_000, Math.min(900_000, Math.floor(params.maxBytes ?? 700_000)));
  let bytesSoFar = 0;
  const acc: MetricRecord[] = [];
  let batchSize = Math.max(25, Math.min(100, pageLimit));
  let hasMorePossible = true;
  let safety = 0;

  while (acc.length < pageLimit && hasMorePossible && safety < 10) {
    safety += 1;
    const start = -(cursor + batchSize);
    const stop = -(cursor + 1);
    let raw: unknown[] = [];
    let attempts = 0;
    while (attempts < 5) {
      attempts += 1;
      try {
        raw = await store.range(METRICS_KEY, start, stop) as unknown[];
        break;
      } catch (e) {
        console.error("metrics.getMetricsPage: range error", e);
        const newBatch = Math.max(10, Math.floor(batchSize / 2));
        if (newBatch === batchSize) {
          raw = [];
          break;
        }
        batchSize = newBatch;
      }
    }
    if (raw.length === 0) {
      hasMorePossible = false;
      break;
    }
    cursor += raw.length;
    const page = parseMetricLines(raw);
    // Sort by timestamp desc
    page.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    for (const m of page) {
      if (params.model && m.model !== params.model) continue;
      if (params.endpoint && m.endpoint !== params.endpoint) continue;
      const approxBytes = JSON.stringify(m).length;
      if (bytesSoFar + approxBytes > byteBudget) {
        hasMorePossible = true;
        break;
      }
      acc.push(m);
      bytesSoFar += approxBytes;
      if (acc.length >= pageLimit) break;
    }
    if (raw.length < batchSize) hasMorePossible = false;
  }
  return { metrics: acc, nextCursor: hasMorePossible ? cursor : null };
}

/**
 * getTotalsAsync aggregates totals across metrics.
 * Example:
 *   const totals = await getTotalsAsync();
 */
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


