import { getListStore } from "@/lib/storage";

const LOG_KEY = process.env.LOG_KEY || "atsbuddy:logs";
const LOG_MAX_LINES = parseInt(process.env.LOG_MAX_LINES || "5000", 10);

export type LogEntry = {
  ts?: string;
  level?: string;
  msg?: string;
  requestId?: string;
  [key: string]: unknown;
};

/**
 * loadLogs returns recent log entries from the ListStore with simple filtering.
 * Example:
 *   const entries = await loadLogs({ requestId: "r1", limit: 100 });
 */
function parseLines(lines: string[]): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === "object") entries.push(obj as LogEntry);
    } catch {
      // ignore malformed
    }
  }
  return entries;
}

export async function loadLogs(params: {
  requestId?: string;
  unattributed?: boolean;
  limit?: number;
  levels?: string[];
}): Promise<LogEntry[]> {
  const { requestId, unattributed, limit = 200, levels } = params;
  const store = getListStore("logs");
  const raw = await store.range(LOG_KEY, -LOG_MAX_LINES, -1);
  const allEntries = parseLines(raw);

  // Sort by timestamp desc if present; otherwise stable order
  allEntries.sort((a, b) => {
    const ta = a.ts ? Date.parse(a.ts) : 0;
    const tb = b.ts ? Date.parse(b.ts) : 0;
    return tb - ta;
  });

  const filtered: LogEntry[] = [];
  for (const e of allEntries) {
    if (levels) {
      const lvl = e.level ? String(e.level) : null;
      if (!lvl) continue;
      if (!levels.includes(lvl)) continue;
    }
    const hasReq = typeof e.requestId === "string" && e.requestId.length > 0;
    if (requestId) {
      if (!hasReq || e.requestId !== requestId) continue;
    } else if (unattributed) {
      if (hasReq) continue;
    } else {
      if (!hasReq) continue; // default to request-scoped logs when no query specified
    }
    filtered.push(e);
    if (filtered.length >= limit) break;
  }
  return filtered;
}


