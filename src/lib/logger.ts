import { getListStore } from "@/lib/store";

type LogLevel = "debug" | "info" | "warn" | "error";

type LoggerOptions = {
  level?: LogLevel;
  console?: boolean; // also log to console
  key?: string; // list key to use in the store
  maxKeep?: number; // keep last N entries in the list
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

export class StoreLogger {
  private readonly minLevel: LogLevel;
  private readonly alsoConsole: boolean;
  private readonly key: string;
  private readonly maxKeep: number;
  private operationChain: Promise<void> = Promise.resolve();

  constructor(options?: LoggerOptions) {
    const envLevel = (process.env.LOG_LEVEL as LogLevel | undefined) || "info";
    this.minLevel = options?.level ?? envLevel;
    this.alsoConsole = options?.console ?? (process.env.NODE_ENV !== "production");
    this.key = options?.key ?? "atsbuddy:logs";
    this.maxKeep = options?.maxKeep ?? parseIntFromEnv(process.env.LOG_MAX_LINES, 5000);
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }

  private async persist(line: string): Promise<void> {
    const store = getListStore();
    await store.push(this.key, line.trim());
    await store.trimToLast(this.key, this.maxKeep);
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

  private async writeLine(line: string): Promise<void> { await this.persist(line); }

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

export const logger = new StoreLogger();


