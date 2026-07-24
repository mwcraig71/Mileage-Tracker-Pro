/**
 * Format a pg DATE value as YYYY-MM-DD without timezone drift.
 * node-postgres parses DATE columns as a JS Date at *local* midnight, so
 * `toISOString().slice(0, 10)` shifts the date back a day on any server
 * running east of UTC. Format from local components instead.
 */
export function toDateOnly(val: unknown): string {
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}
