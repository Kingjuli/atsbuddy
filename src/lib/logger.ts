import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline as pipelineCallback } from "node:stream";
import { promisify } from "node:util";

type LogLevel = "debug" | "info" | "warn" | "error";

type LoggerOptions = {
  filePath?: string;
  maxBytes?: number; // rotate when current file exceeds this size
  maxFiles?: number; // number of rotated files to keep (app.log.1..N)
  level?: LogLevel;
  console?: boolean; // also log to console
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function parseIntFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class RotatingFileLogger {
  private readonly baseFilePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly minLevel: LogLevel;
  private readonly alsoConsole: boolean;

  private stream: fs.WriteStream | null = null;
  private currentSize = 0;
  private operationChain: Promise<void> = Promise.resolve();

  constructor(options?: LoggerOptions) {
    const logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");
    const fileName = process.env.LOG_FILE || "app.log";
    const resolvedPath = options?.filePath || path.join(logDir, fileName);

    this.baseFilePath = resolvedPath;
    this.maxBytes = options?.maxBytes ?? parseIntFromEnv(process.env.LOG_MAX_BYTES, 5 * 1024 * 1024); // 5MB
    this.maxFiles = options?.maxFiles ?? parseIntFromEnv(process.env.LOG_MAX_FILES, 3);
    const envLevel = (process.env.LOG_LEVEL as LogLevel | undefined) || "info";
    this.minLevel = options?.level ?? envLevel;
    this.alsoConsole = options?.console ?? (process.env.NODE_ENV !== "production");

    this.initialize();
  }

  private initialize() {
    const dir = path.dirname(this.baseFilePath);
    fs.mkdirSync(dir, { recursive: true });

    // Determine existing size if file exists
    try {
      const stat = fs.statSync(this.baseFilePath);
      this.currentSize = stat.size;
    } catch {
      this.currentSize = 0;
    }

    this.stream = fs.createWriteStream(this.baseFilePath, { flags: "a" });
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }

  private async rotateIfNeeded(nextChunkLength: number): Promise<void> {
    if (this.currentSize + nextChunkLength <= this.maxBytes) return;

    // Close existing stream before rotating
    await new Promise<void>((resolve) => {
      if (!this.stream) return resolve();
      this.stream.end(() => resolve());
    });
    this.stream = null;

    // Compress-rotate: keep maxFiles-1 compressed backups: .1.gz .. .N.gz
    if (this.maxFiles > 1) {
      const pipeline = promisify(pipelineCallback);
      const gz = (i: number) => `${this.baseFilePath}.${i}.gz`;

      // Delete oldest
      try { await fsp.unlink(gz(this.maxFiles - 1)); } catch { /* noop */ }
      try { await fsp.unlink(`${this.baseFilePath}.${this.maxFiles - 1}`); } catch { /* noop */ }

      // Shift higher indices
      for (let i = this.maxFiles - 2; i >= 1; i--) {
        // Prefer moving compressed backup
        try {
          await fsp.rename(gz(i), gz(i + 1));
        } catch {
          // If older uncompressed exists, rename it into compressed slot name
          try { await fsp.rename(`${this.baseFilePath}.${i}`, gz(i + 1)); } catch { /* noop */ }
        }
      }

      // Compress current base into .1.gz
      try {
        await pipeline(
          fs.createReadStream(this.baseFilePath),
          zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED }),
          fs.createWriteStream(gz(1))
        );
      } catch {
        // As a last resort, copy without compression
        try { await fsp.copyFile(this.baseFilePath, gz(1)); } catch { /* noop */ }
      }
      // Truncate the base file to start fresh
      try { await fsp.truncate(this.baseFilePath, 0); } catch { /* noop */ }
    } else {
      // No backups: just truncate current file
      try { await fsp.truncate(this.baseFilePath, 0); } catch { /* noop */ }
    }

    // Create a fresh stream and reset size
    this.stream = fs.createWriteStream(this.baseFilePath, { flags: "a" });
    this.currentSize = 0;
  }

  private enqueue(operation: () => Promise<void>): void {
    this.operationChain = this.operationChain.then(operation).catch(() => { /* swallow to keep chain alive */ });
  }

  private formatLine(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const payload: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...(meta || {}),
    };
    const line = JSON.stringify(payload);
    return line + "\n";
  }

  private async writeLine(line: string): Promise<void> {
    const bytes = Buffer.byteLength(line, "utf8");
    await this.rotateIfNeeded(bytes);

    if (!this.stream) {
      this.stream = fs.createWriteStream(this.baseFilePath, { flags: "a" });
    }
    await new Promise<void>((resolve, reject) => {
      this.stream!.write(line, (err) => (err ? reject(err) : resolve()));
    });
    this.currentSize += bytes;
  }

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const line = this.formatLine(level, message, meta);
    if (this.alsoConsole) {
      const printer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      printer(line.trim());
    }

    this.enqueue(async () => {
      try {
        await this.writeLine(line);
      } catch {
        // If file write fails, fall back to console (already printed above if enabled)
      }
    });
  }

  debug(message: string, meta?: Record<string, unknown>) { this.log("debug", message, meta); }
  info(message: string, meta?: Record<string, unknown>) { this.log("info", message, meta); }
  warn(message: string, meta?: Record<string, unknown>) { this.log("warn", message, meta); }
  error(message: string, meta?: Record<string, unknown>) { this.log("error", message, meta); }
}

export const logger = new RotatingFileLogger();


