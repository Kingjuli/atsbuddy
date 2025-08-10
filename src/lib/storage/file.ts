import { promises as fs } from "node:fs";
import path from "node:path";
import type { ListStore } from "./types";

function base64UrlEncode(input: string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getDefaultBaseDir(): string {
  const configured = process.env.DATA_DIR;
  if (configured) return configured;
  if (process.env.VERCEL) return "/tmp/atsbuddy-data";
  return path.join(process.cwd(), ".data", "atsbuddy");
}

export class FileListStore implements ListStore {
  readonly kind: string;
  private readonly baseDir: string;

  constructor(kind: string, baseDir?: string) {
    this.kind = kind;
    this.baseDir = baseDir || getDefaultBaseDir();
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private filePathForKey(key: string): string {
    const fileName = `${base64UrlEncode(key)}.log`;
    const subdir = this.kind ? this.kind : undefined;
    return path.join(this.baseDir, ...(subdir ? [subdir] : []), fileName);
  }

  async push(key: string, value: string): Promise<void> {
    await this.ensureBaseDir();
    if (this.kind) await fs.mkdir(path.join(this.baseDir, this.kind), { recursive: true });
    const file = this.filePathForKey(key);
    await fs.appendFile(file, `${value}\n`, { encoding: "utf-8" });
  }

  async range(key: string, start: number, stop: number): Promise<string[]> {
    await this.ensureBaseDir();
    const file = this.filePathForKey(key);
    try {
      const content = await fs.readFile(file, { encoding: "utf-8" });
      const lines = content.split("\n").filter((l) => l.length > 0);
      if (lines.length === 0) return [];
      const normalize = (idx: number): number => {
        if (idx < 0) return Math.max(0, lines.length + idx);
        return Math.min(idx, lines.length - 1);
      };
      const a = normalize(start);
      const b = normalize(stop);
      if (a > b) return [];
      return lines.slice(a, b + 1);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  async trimToLast(key: string, max: number): Promise<void> {
    await this.ensureBaseDir();
    const file = this.filePathForKey(key);
    try {
      const content = await fs.readFile(file, { encoding: "utf-8" });
      const lines = content.split("\n").filter((l) => l.length > 0);
      if (lines.length <= max) return;
      const startIdx = Math.max(0, lines.length - max);
      const trimmed = lines.slice(startIdx).join("\n") + "\n";
      await fs.writeFile(file, trimmed, { encoding: "utf-8" });
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
  }
}


