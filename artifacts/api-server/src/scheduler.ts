import cron from "node-cron";
import { pool } from "./lib/db";
import { logger } from "./lib/logger";
import { sendAlertEmail } from "./lib/email";
import {
  BASE_URL,
  getFleetTz,
  metersToMiles,
  localDateOf,
  localMidnightUtc,
  fetchDevicePoints,
} from "./lib/onestep";

/** Returns today's date as YYYY-MM-DD in the configured FLEET_TZ. */
function getTodayLocal(): string {
  return localDateOf(new Date().toISOString(), getFleetTz());
}

export interface CheckResult {
  checked_date: string;
  trucks_with_movement: number;
  alerts_inserted: number;
  emails_sent: number;
  details: Array<{ device_id: string; device_name: string; issue: string }>;
}

/**
 * Query the OneStep GPS API for today's movement for all active trucks.
 * Returns trucks that have driven any miles since midnight today.
 * NOTE: no `sort` param — adding sort to device-point calls causes 502.
 */
async function fetchTodayMovingTrucks(): Promise<
  Array<{ device_id: string; device_name: string; miles: number }>
> {
  const apiKey = process.env.ONESTEP_GPS_API_KEY;
  if (!apiKey) {
    logger.warn("ONESTEP_GPS_API_KEY not set — skipping GPS check");
    return [];
  }

  const tz = getFleetTz();
  const todayStr = getTodayLocal();
  // Window: local midnight today (in FLEET_TZ) .. now.
  const dtFrom = localMidnightUtc(todayStr, tz);
  const dtTo = new Date(); // now

  // Fetch all GPS devices
  const devResp = await fetch(`${BASE_URL}/device?api-key=${apiKey}`);
  if (!devResp.ok) {
    logger.error("Failed to fetch GPS devices during accountability check");
    return [];
  }
  const devData = (await devResp.json()) as { result_list: unknown[] };
  const devices = (devData.result_list ?? []) as Array<{
    device_id: string;
    display_name: string;
  }>;

  const moving: Array<{ device_id: string; device_name: string; miles: number }> = [];

  for (const device of devices) {
    try {
      const points = (
        await fetchDevicePoints({
          apiKey,
          deviceId: device.device_id,
          dtFrom,
          dtTo,
          limit: 5000,
        })
      )
        .slice()
        .sort((a, b) => (a.dt_tracker ?? "").localeCompare(b.dt_tracker ?? ""));

      let firstOdo: number | null = null;
      let lastOdo: number | null = null;
      for (const p of points) {
        const odo = p.device_point_detail?.vbus_odometer?.value;
        if (odo == null || odo === 0) continue;
        if (firstOdo === null) firstOdo = odo;
        lastOdo = odo;
      }

      if (firstOdo !== null && lastOdo !== null) {
        const miles = Math.max(0, metersToMiles(lastOdo - firstOdo));
        if (miles > 0) {
          moving.push({
            device_id:   device.device_id,
            device_name: device.display_name ?? device.device_id,
            miles,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, device_id: device.device_id }, "GPS fetch failed for device");
    }
  }

  return moving;
}

/**
 * Core accountability check.
 * Fetches today's GPS movement, cross-references driver_sessions,
 * upserts daily_alerts, and emails affected state contacts.
 */
export async function runAccountabilityCheck(): Promise<CheckResult> {
  const checkedDate = getTodayLocal();
  const movingTrucks = await fetchTodayMovingTrucks();

  const client = await pool.connect();
  try {
    const details: CheckResult["details"] = [];
    let alertsInserted = 0;
    let emailsSent = 0;

    for (const truck of movingTrucks) {
      // Deterministic session check: aggregate all sessions for this truck today.
      // A truck is OK if at least one session has a non-empty project_number.
      const sessionResult = await client.query<{
        session_count: string;
        has_project: boolean;
      }>(
        `SELECT
           COUNT(*) AS session_count,
           BOOL_OR(project_number IS NOT NULL AND project_number <> '') AS has_project
         FROM driver_sessions
         WHERE device_id = $1
           AND started_at::date = $2::date`,
        [truck.device_id, checkedDate]
      );

      const { session_count, has_project } = sessionResult.rows[0];
      const count = parseInt(session_count, 10);

      let issue: "no_session" | "no_project" | null = null;
      if (count === 0) {
        issue = "no_session";
      } else if (!has_project) {
        issue = "no_project";
      }

      if (!issue) continue;

      const insertResult = await client.query(
        `INSERT INTO daily_alerts (alert_date, device_id, device_name, issue)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (alert_date, device_id, issue) DO NOTHING`,
        [checkedDate, truck.device_id, truck.device_name, issue]
      );

      const inserted = (insertResult.rowCount ?? 0) > 0;
      if (inserted) alertsInserted++;

      details.push({ device_id: truck.device_id, device_name: truck.device_name, issue });

      // Email state contacts for this truck (only on newly inserted alerts)
      if (inserted) {
        const contactsResult = await client.query<{
          contact_name: string;
          email: string;
        }>(
          `SELECT sc.contact_name, sc.email
           FROM truck_states ts
           JOIN state_contacts sc ON sc.state_code = ts.state_code
           WHERE ts.device_id = $1`,
          [truck.device_id]
        );

        for (const contact of contactsResult.rows) {
          await sendAlertEmail({
            to:          contact.email,
            contactName: contact.contact_name,
            truckName:   truck.device_name,
            alertDate:   checkedDate,
            issue,
          });
          emailsSent++;
        }
      }
    }

    logger.info(
      { checkedDate, trucksWithMovement: movingTrucks.length, alertsInserted, emailsSent },
      "Accountability check complete"
    );

    return {
      checked_date:         checkedDate,
      trucks_with_movement: movingTrucks.length,
      alerts_inserted:      alertsInserted,
      emails_sent:          emailsSent,
      details,
    };
  } finally {
    client.release();
  }
}

// ── Dynamic scheduler ─────────────────────────────────────────────────────────

let currentTask: ReturnType<typeof cron.schedule> | null = null;

function parseCronTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(s => parseInt(s, 10));
  const hour   = isNaN(h) ? 10 : Math.max(0, Math.min(23, h));
  const minute = isNaN(m) ? 0  : Math.max(0, Math.min(59, m));
  return `${minute} ${hour} * * *`;
}

function scheduleAt(hhmm: string): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  const expr = parseCronTime(hhmm);
  currentTask = cron.schedule(expr, async () => {
    logger.info({ checkTime: hhmm }, "Running daily accountability check (scheduled)");
    try {
      await runAccountabilityCheck();
    } catch (err) {
      logger.error({ err }, "Scheduled accountability check failed");
    }
  });
  logger.info({ checkTime: hhmm, cronExpr: expr }, "Accountability check scheduled");
}

/** Read check_time from DB, then start the cron. */
export async function startScheduler(): Promise<void> {
  try {
    const result = await pool.query<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'check_time'`
    );
    const time = result.rows[0]?.value ?? "10:00";
    scheduleAt(time);
  } catch (err) {
    logger.error({ err }, "Failed to read check_time from DB; defaulting to 10:00");
    scheduleAt("10:00");
  }
}

/** Update check_time in DB and reschedule the cron. */
export async function updateSchedulerTime(hhmm: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('check_time', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [hhmm]
  );
  scheduleAt(hhmm);
}
