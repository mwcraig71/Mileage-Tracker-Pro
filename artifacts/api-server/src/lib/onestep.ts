/**
 * Shared helpers for talking to the One-Step GPS public API and for
 * bucketing device points into local calendar days. Previously this logic
 * was copy-pasted between routes/gps.ts and scheduler.ts.
 */

export const BASE_URL = "https://track.onestepgps.com/v3/api/public";

const METERS_PER_MILE = 1609.344;

/** Default fleet timezone; overridable via the FLEET_TZ env var. */
export function getFleetTz(): string {
  return process.env.FLEET_TZ || "America/New_York";
}

export function getApiKey(): string {
  const key = process.env.ONESTEP_GPS_API_KEY;
  if (!key) {
    throw new Error("ONESTEP_GPS_API_KEY environment variable is not set");
  }
  return key;
}

export function metersToMiles(meters: number): number {
  return Math.round((meters / METERS_PER_MILE) * 10) / 10;
}

/**
 * Return the local calendar date (YYYY-MM-DD) of an ISO timestamp as observed
 * in the given IANA timezone. Uses Intl so DST transitions are handled
 * correctly, unlike a naive `isoTimestamp.substring(0, 10)` which always
 * reports the UTC date.
 */
export function localDateOf(isoTimestamp: string, tz: string): string {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return "";
  // en-CA gives YYYY-MM-DD ordering directly.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // e.g. "2026-07-08"
}

/**
 * Compute the offset (in minutes) of the given timezone from UTC at the given
 * instant. Positive means the local wall clock is ahead of UTC.
 */
function tzOffsetMinutes(at: Date, tz: string): number {
  // Format the instant as wall-clock time in the target tz, then interpret
  // those wall-clock fields as if they were UTC. The difference between that
  // and the real instant is the offset.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Return the UTC `Date` instant corresponding to local midnight (00:00:00) of
 * the given YYYY-MM-DD date in timezone `tz`. Computed by first guessing the
 * offset at that naive-UTC midnight, then correcting once so DST-boundary
 * dates resolve to the right instant.
 */
export function localMidnightUtc(dateStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const naiveUtc = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0);
  const guess = new Date(naiveUtc);
  const off = tzOffsetMinutes(guess, tz);
  // local_midnight_utc = naiveUtc - offset. Correct once for DST edges.
  let instant = naiveUtc - off * 60000;
  const off2 = tzOffsetMinutes(new Date(instant), tz);
  if (off2 !== off) instant = naiveUtc - off2 * 60000;
  return new Date(instant);
}

/**
 * Return the UTC `Date` instant corresponding to local end-of-day
 * (23:59:59.999) of the given YYYY-MM-DD date in timezone `tz`.
 */
export function localEndOfDayUtc(dateStr: string, tz: string): Date {
  const start = localMidnightUtc(dateStr, tz);
  // Next local midnight minus 1ms. Add ~25h then snap to that day's start is
  // fragile across DST; instead take start + 24h, recompute the day, and back
  // off to just before the following local midnight.
  const nextDay = localDateOf(
    new Date(start.getTime() + 24 * 3600 * 1000 + 3600 * 1000).toISOString(),
    tz,
  );
  const nextMidnight = localMidnightUtc(nextDay, tz);
  return new Date(nextMidnight.getTime() - 1);
}

interface DevicePoint {
  dt_tracker?: string;
  dt_server?: string;
  device_point_detail?: { vbus_odometer?: { value?: number } };
  [k: string]: unknown;
}

/**
 * Fetch device points for a device over [dtFrom, dtTo], following pagination.
 * One-Step caps a single response at `limit` rows; when a full page is
 * returned we advance dt_server_from past the last point and fetch again,
 * accumulating up to `maxPages` pages (default 10).
 */
export async function fetchDevicePoints(opts: {
  apiKey: string;
  deviceId: string;
  dtFrom: Date;
  dtTo: Date;
  limit?: number;
  maxPages?: number;
  sort?: boolean;
}): Promise<DevicePoint[]> {
  const limit = opts.limit ?? 5000;
  const maxPages = opts.maxPages ?? 10;
  const dtToIso = opts.dtTo.toISOString();

  const all: DevicePoint[] = [];
  let fromIso = opts.dtFrom.toISOString();

  for (let page = 0; page < maxPages; page++) {
    let url =
      `${BASE_URL}/device-point?api-key=${opts.apiKey}` +
      `&device_id=${opts.deviceId}` +
      `&dt_server_from=${encodeURIComponent(fromIso)}` +
      `&dt_server_to=${encodeURIComponent(dtToIso)}` +
      `&limit=${limit}`;
    if (opts.sort) url += `&sort=dt_tracker,asc`;

    const resp = await fetch(url);
    if (!resp.ok) {
      // Surface the failure to the caller by throwing; callers decide how to
      // treat a partial vs. total failure.
      throw new Error(`device-point fetch failed: HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as { result_list?: unknown[] };
    const batch = (data.result_list ?? []) as DevicePoint[];
    all.push(...batch);

    if (batch.length < limit) break; // last page

    // Advance past the last point to avoid re-fetching it.
    const last = batch[batch.length - 1];
    const cursor = last.dt_server ?? last.dt_tracker;
    if (!cursor) break;
    fromIso = new Date(new Date(cursor).getTime() + 1000).toISOString();
  }

  return all;
}

/** first/last odometer reading (meters) per local calendar day. */
export interface DayOdometer {
  first: number;
  last: number;
}

/**
 * Group device points by local calendar day (in `tz`), keeping the first and
 * last non-zero odometer reading per day. Points are sorted by dt_tracker
 * ascending first so "first"/"last" are chronological.
 */
export function bucketPointsByDay(
  points: DevicePoint[],
  tz: string,
): Record<string, DayOdometer> {
  const sorted = points
    .slice()
    .sort((a, b) => (a.dt_tracker ?? "").localeCompare(b.dt_tracker ?? ""));

  const byDate: Record<string, DayOdometer> = {};
  for (const p of sorted) {
    const odoMeters = p.device_point_detail?.vbus_odometer?.value;
    if (odoMeters == null || odoMeters === 0) continue;
    const date = p.dt_tracker ? localDateOf(p.dt_tracker, tz) : "";
    if (!date) continue;
    if (!byDate[date]) byDate[date] = { first: odoMeters, last: odoMeters };
    else byDate[date].last = odoMeters;
  }
  return byDate;
}
