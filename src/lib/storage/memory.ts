import type { ListStore } from "./types";

export class InMemoryListStore implements ListStore {
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
    if (list.length === 0) return [];
    const normalize = (idx: number): number => {
      if (idx < 0) return Math.max(0, list.length + idx);
      return Math.min(idx, list.length - 1);
    };
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


