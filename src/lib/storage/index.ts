import { UpstashListStore } from "./upstash";
import { FileListStore } from "./file";
import type { ListStore } from "./types";

const storeSingletons: Record<string, ListStore> = {};

/**
 * getListStore returns a process-wide ListStore.
 * Example:
 *   const store = getListStore();
 *   await store.push("key", JSON.stringify({ a: 1 }));
 */
export function getListStore(kind: string = ""): ListStore {
  const k = kind || "default";
  if (storeSingletons[k]) return storeSingletons[k];
  const preferFile = String(process.env.STORAGE_BACKEND || "").toLowerCase() === "file";
  if (preferFile) {
    storeSingletons[k] = new FileListStore(kind || "");
  } else {
    // Prefer Upstash when available via fromEnv(); fall back to file storage
    try {
      storeSingletons[k] = new UpstashListStore(kind || "");
    } catch (e) {
      console.error("getListStore Upstash init error", e);
      storeSingletons[k] = new FileListStore(kind || "");
    }
  }
  return storeSingletons[k];
}

export type { ListStore } from "./types";
export { UpstashListStore } from "./upstash";
export { FileListStore } from "./file";


