import { Redis } from "@upstash/redis";
import type { ListStore } from "./types";

export class UpstashListStore implements ListStore {
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
    await this.client.ltrim(key, -max, -1);
  }
}


