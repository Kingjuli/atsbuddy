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
    return await this.client.lrange(key, start, stop);
  }

  async trimToLast(key: string, max: number): Promise<void> {
    await this.client.ltrim(key, -max, -1);
  }
}


