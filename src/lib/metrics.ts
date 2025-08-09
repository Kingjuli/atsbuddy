import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger";

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
const metricsBuffer: MetricRecord[] = [];

// Simple JSON file persistence (use /tmp on Vercel which is the only writable path)
const DATA_DIR = process.env.METRICS_DIR
  ? path.resolve(process.env.METRICS_DIR)
  : (process.env.VERCEL ? "/tmp/data" : path.join(process.cwd(), "data"));
const METRICS_FILE = path.join(DATA_DIR, "metrics.json");
let saveChain: Promise<void> = Promise.resolve();

function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* noop */ }
}

function loadMetricsFromDisk() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(METRICS_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      const trimmed = arr.slice(-MAX_RECORDS);
      metricsBuffer.splice(0, metricsBuffer.length, ...trimmed);
    }
  } catch {
    // ignore missing or invalid file
  }
}

async function persistMetricsToDisk(): Promise<void> {
  ensureDataDir();
  const tmp = METRICS_FILE + ".tmp";
  const json = JSON.stringify(metricsBuffer.slice(-MAX_RECORDS));
  try {
    await fsp.writeFile(tmp, json, "utf8");
    await fsp.rename(tmp, METRICS_FILE);
  } catch (err) {
    try { await fsp.unlink(tmp); } catch {}
    logger.warn("persistMetricsToDisk failed", { error: err instanceof Error ? err.message : String(err), file: METRICS_FILE });
  }
}

export function recordMetric(rec: MetricRecord) {
  metricsBuffer.push(rec);
  if (metricsBuffer.length > MAX_RECORDS) metricsBuffer.shift();
  // enqueue persist to maintain order and avoid concurrent writes
  saveChain = saveChain.then(() => persistMetricsToDisk());
}

export function getMetrics(): MetricRecord[] {
  // Reload from disk for cross-process visibility
  loadMetricsFromDisk();
  return [...metricsBuffer].reverse();
}

export function getTotals() {
  loadMetricsFromDisk();
  let totalCost = 0;
  let totalRequests = 0;
  let totalInput = 0;
  let totalCachedInput = 0;
  let totalOutput = 0;
  for (const m of metricsBuffer) {
    totalRequests += 1;
    totalCost += m.costUSD || 0;
    totalInput += m.inputTokens || 0;
    totalCachedInput += m.cachedInputTokens || 0;
    totalOutput += m.outputTokens || 0;
  }
  return { totalCost, totalRequests, totalInput, totalCachedInput, totalOutput };
}

// Load at module import
loadMetricsFromDisk();


