import { InMemoryListStore } from "./memory";
import { UpstashListStore } from "./upstash";
import type { ListStore } from "./types";

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

export type { ListStore } from "./types";
export { InMemoryListStore } from "./memory";
export { UpstashListStore } from "./upstash";


