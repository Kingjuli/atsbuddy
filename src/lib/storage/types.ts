export interface ListStore {
  push(key: string, value: string): Promise<void>;
  range(key: string, start: number, stop: number): Promise<string[]>;
  trimToLast(key: string, max: number): Promise<void>;
}


