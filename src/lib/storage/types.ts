/**
 * ListStore abstracts a simple append-only list with range/trim operations.
 * Example:
 *   await list.push("logs", "{\\"level\\":\\"info\\"}");
 */
export interface ListStore {
  readonly kind: string; // e.g., "logs", "metrics"
  push(key: string, value: string): Promise<void>;
  range(key: string, start: number, stop: number): Promise<string[]>;
  trimToLast(key: string, max: number): Promise<void>;
}


