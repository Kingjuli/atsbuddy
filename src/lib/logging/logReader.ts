import { getListStore } from "@/lib/storage";

export type LogEntry = {
  ts?: string;
  level?: string;
  msg?: string;
  requestId?: string;
  [key: string]: unknown;
};

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
  const store = getListStore();
  const raw = await store.range("atsbuddy:logs", -2000, -1);
  const allEntries = parseLines(raw);

  // Sort by timestamp desc if present; otherwise stable order
  allEntries.sort((a, b) => {
    const ta = a.ts ? Date.parse(a.ts) : 0;
    const tb = b.ts ? Date.parse(b.ts) : 0;
    return tb - ta;
  });

  const filtered: LogEntry[] = [];
  for (const e of allEntries) {
    if (levels && e.level && !levels.includes(String(e.level))) continue;
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


