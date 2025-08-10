import { Redis } from "@upstash/redis";
import type { ListStore } from "./types";
 

/**
 * UpstashListStore implements ListStore using Upstash Redis REST API.
 * Example:
 *   const store = new UpstashListStore(url, token);
 *   await store.push("metrics", JSON.stringify({ ts: Date.now() }));
 */
export class UpstashListStore implements ListStore {
  readonly kind: string;
  private readonly client: Redis;

  constructor(kind: string) {
    this.kind = kind;
    this.client = Redis.fromEnv();
  }

  async push(key: string, value: string): Promise<void> {
    await this.client.rpush(key, value);
  }

  async range(key: string, start: number, stop: number): Promise<string[]> {
    // Normalize indices and chunk requests to avoid Upstash max response size limits
    let a = start;
    let b = stop;
    let listLength: number | null = null;
    if (a < 0 || b < 0) {
      try {
        listLength = await this.client.llen(key);
      } catch {
        listLength = null;
      }
      if (listLength != null) {
        const normalize = (idx: number): number => {
          if (idx < 0) return Math.max(0, listLength! + idx);
          return Math.max(0, Math.min(idx, listLength! - 1));
        };
        a = normalize(a);
        b = normalize(b);
      }
    }
    if (a > b) return [];

    // Extremely conservative per-call chunk to keep each Upstash request under limits
    const CHUNK = 100;
    const results: string[] = [];
    let i = a;
    while (i <= b) {
      const j = Math.min(i + CHUNK - 1, b);
      try {
        const part = await this.client.lrange(key, i, j);
        if (part.length === 0 && (j - i + 1) > 1) {
          // If the provider rejected or returned empty unexpectedly, reduce chunk size
          const mid = Math.floor((i + j) / 2);
          const p1 = await this.client.lrange(key, i, mid);
          const p2 = await this.client.lrange(key, mid + 1, j);
          results.push(...p1, ...p2);
        } else {
          results.push(...part);
        }

      } catch (e) {
        console.error("upstash.range chunk error", e);
        // On error, try smaller chunks
        const mid = Math.floor((i + j) / 2);
        try {
          const p1 = await this.client.lrange(key, i, mid);
          results.push(...p1);
        } catch (e) {
          console.error("upstash.range left split error", e);
        }
        try {
          const p2 = await this.client.lrange(key, mid + 1, j);
          results.push(...p2);
        } catch (e) {
          console.error("upstash.range right split error", e);
        }
      }
      i = j + 1;
    }
    return results;
  }

  async trimToLast(key: string, max: number): Promise<void> {
    await this.client.ltrim(key, -max, -1);
  }
}


