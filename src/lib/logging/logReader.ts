import { getListStore } from "@/lib/storage";

const LOG_KEY = process.env.LOG_KEY || "atsbuddy:logs";
const LOG_MAX_LINES = parseInt(process.env.LOG_MAX_LINES || "100", 10);

export type LogEntry = {
  ts?: string;
  level?: string;
  msg?: string;
  requestId?: string;
  [key: string]: unknown;
};

// Minimal tolerant parsing: accept objects, or JSON.parse strings; skip otherwise
function parseLines(lines: Array<unknown>): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const raw of lines) {
    if (raw && typeof raw === "object") {
      entries.push(raw as LogEntry);
      continue;
    }
    try {
      const obj = JSON.parse(String(raw ?? ""));
      if (obj && typeof obj === "object") entries.push(obj as LogEntry);
    } catch (e) {
      console.error("logReader.parseLines: parse error", e);
    }
  }
  return entries;
}

export async function loadLogs(params: {
  requestId?: string;
  unattributed?: boolean;
  limit?: number;
  levels?: string[];
  cursor?: number; // number of tail items already paged through
  maxBytes?: number; // unused (kept for API compatibility)
}): Promise<{ entries: LogEntry[]; nextCursor: number | null }>
{
  const { requestId, unattributed, levels } = params;
  const pageLimit = Math.min(LOG_MAX_LINES, Math.max(10, params.limit ?? 100));
  const cursor = Math.max(0, Math.floor(params.cursor ?? 0));
  const store = getListStore("logs");
  let raw: unknown[] = [];
  if (requestId) {
    // Use dedicated per-request key for efficient fetch
    const reqKey = `${LOG_KEY}:req:${requestId}`;
    const start = -(cursor + pageLimit);
    const stop = -(cursor + 1);
    try {
      raw = (await store.range(reqKey, start, stop)) as unknown[];
    } catch (e) {
      console.error("logReader.loadLogs: range reqKey error", e);
      raw = [];
    }
  } else {
    const start = -(cursor + pageLimit);
    const stop = -(cursor + 1);
    try {
      raw = (await store.range(LOG_KEY, start, stop)) as unknown[];
    } catch (e) {
      console.error("logReader.loadLogs: range error", e);
      return { entries: [], nextCursor: null };
    }
  }

  // Parse and sort newest-first
  const pageEntries = parseLines(raw).sort((a, b) => {
    const ta = a.ts ? Date.parse(a.ts) : 0;
    const tb = b.ts ? Date.parse(b.ts) : 0;
    return tb - ta;
  });

  const result: LogEntry[] = [];
  for (const e of pageEntries) {
    if (levels) {
      const lvl = e.level ? String(e.level) : null;
      if (!lvl) continue;
      if (!levels.includes(lvl)) continue;
    }
    const hasReq = typeof e.requestId === "string" && e.requestId.length > 0;
    if (requestId) {
      // already scoped by per-request key
    } else if (unattributed) {
      if (hasReq) continue;
    } else {
      if (!hasReq) continue;
    }
    result.push(e);
    if (result.length >= pageLimit) break;
  }

  const nextCursor = raw.length > 0 ? cursor + raw.length : null;
  return { entries: result, nextCursor };
}


