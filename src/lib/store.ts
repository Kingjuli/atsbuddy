import { Redis } from "@upstash/redis";

export interface ListStore {
  push(key: string, value: string): Promise<void>;
  range(key: string, start: number, stop: number): Promise<string[]>;
  trimToLast(key: string, max: number): Promise<void>;
}

class UpstashListStore implements ListStore {
  private readonly client: Redis;

  constructor(url: string, token: string) {
    this.client = new Redis({ url, token });
  }

  async push(key: string, value: string): Promise<void> {
    await this.client.rpush(key, value);
  }

  async range(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.lrange(key, start, stop);
  }

  async trimToLast(key: string, max: number): Promise<void> {
    // Keep only the last `max` items
    await this.client.ltrim(key, -max, -1);
  }
}

class InMemoryListStore implements ListStore {
  private readonly keyToList = new Map<string, string[]>();

  private getList(key: string): string[] {
    let list = this.keyToList.get(key);
    if (!list) {
      list = [];
      this.keyToList.set(key, list);
    }
    return list;
  }

  async push(key: string, value: string): Promise<void> {
    const list = this.getList(key);
    list.push(value);
  }

  async range(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.getList(key);
    // Redis semantics: start/stop inclusive, negative indexes from end
    const normalize = (idx: number): number => {
      if (idx < 0) return Math.max(0, list.length + idx);
      return Math.min(idx, list.length - 1);
    };
    if (list.length === 0) return [];
    const a = normalize(start);
    const b = normalize(stop);
    if (a > b) return [];
    return list.slice(a, b + 1);
  }

  async trimToLast(key: string, max: number): Promise<void> {
    const list = this.getList(key);
    if (list.length > max) {
      const start = Math.max(0, list.length - max);
      const sliced = list.slice(start);
      this.keyToList.set(key, sliced);
    }
  }
}

let storeSingleton: ListStore | null = null;

export function getListStore(): ListStore {
  if (storeSingleton) return storeSingleton;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    storeSingleton = new UpstashListStore(String(url), String(token));
  } else {
    storeSingleton = new InMemoryListStore();
  }
  return storeSingleton;
}


