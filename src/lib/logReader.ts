import { promises as fsp } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export type LogEntry = {
  ts?: string;
  level?: string;
  msg?: string;
  requestId?: string;
  [key: string]: unknown;
};

function getPaths() {
  const logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");
  const fileName = process.env.LOG_FILE || "app.log";
  const base = path.join(logDir, fileName);
  const maxFiles = Number(process.env.LOG_MAX_FILES || 3);
  const gz: string[] = [];
  for (let i = 1; i <= Math.max(1, maxFiles - 1); i++) {
    gz.push(`${base}.${i}.gz`);
  }
  return { base, gz };
}

async function readTextFileTail(filePath: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  try {
    const stat = await fsp.stat(filePath);
    const size = stat.size;
    const start = Math.max(0, size - maxBytes);
    const fd = await fsp.open(filePath, "r");
    try {
      const { buffer, bytesRead } = await fd.read({
        position: start,
        length: size - start,
        buffer: Buffer.alloc(size - start),
      });
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await fd.close();
    }
  } catch {
    return "";
  }
}

async function readGzipFile(filePath: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  try {
    const buf = await fsp.readFile(filePath);
    // If file huge, slice from the end heuristically (gzip streams don't support tail easily)
    const slice = buf.length > maxBytes ? buf.subarray(buf.length - maxBytes) : buf;
    const inflated = zlib.gunzipSync(slice);
    return inflated.toString("utf8");
  } catch {
    return "";
  }
}

function parseLines(text: string): LogEntry[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
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
  const { base, gz } = getPaths();

  const allEntries: LogEntry[] = [];
  // Read current log tail first
  const baseText = await readTextFileTail(base);
  allEntries.push(...parseLines(baseText));

  // Then read rotated compressed from newest to oldest
  for (const p of gz) {
    const text = await readGzipFile(p);
    if (text) allEntries.push(...parseLines(text));
    if (allEntries.length >= limit * 4) break; // soft cap for performance
  }

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


