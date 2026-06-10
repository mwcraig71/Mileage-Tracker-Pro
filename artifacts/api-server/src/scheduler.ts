import cron from "node-cron";
import { Pool } from "pg";
import { logger } from "./lib/logger";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface CheckResult {
  checked_date: string;
  trucks_with_movement: number;
  alerts_inserted: number;
  details: Array<{ device_id: string; device_name: string; issue: string }>;
}

/**
 * Core accountability check logic.
 * Looks at yesterday's GPS cache, cross-references driver_sessions,
 * and inserts daily_alerts for any truck with unaccounted movement.
 */
export async function runAccountabilityCheck(): Promise<CheckResult> {
  const client = await pool.connect();
  try {
    // Yesterday's date in local server time (YYYY-MM-DD)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const checkedDate = yesterday.toISOString().slice(0, 10);

    // 1. Find all trucks that moved yesterday (gps_miles > 0 in cache)
    const cacheResult = await client.query(
      `SELECT device_id, device_name, gps_miles
       FROM gps_cache
       WHERE date = $1 AND gps_miles > 0`,
      [checkedDate]
    );

    const movingTrucks = cacheResult.rows as Array<{
      device_id: string;
      device_name: string;
      gps_miles: number;
    }>;

    const details: CheckResult["details"] = [];
    let alertsInserted = 0;

    for (const truck of movingTrucks) {
      // 2. Check for driver sessions on that date for this truck
      const sessionResult = await client.query(
        `SELECT id, project_number
         FROM driver_sessions
         WHERE device_id = $1
           AND started_at::date = $2::date
         LIMIT 1`,
        [truck.device_id, checkedDate]
      );

      const session = sessionResult.rows[0] as
        | { id: number; project_number: string | null }
        | undefined;

      let issue: "no_session" | "no_project" | null = null;

      if (!session) {
        issue = "no_session";
      } else if (!session.project_number?.trim()) {
        issue = "no_project";
      }

      if (issue) {
        const insertResult = await client.query(
          `INSERT INTO daily_alerts (alert_date, device_id, device_name, issue)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (alert_date, device_id, issue) DO NOTHING`,
          [checkedDate, truck.device_id, truck.device_name, issue]
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) {
          alertsInserted++;
        }
        details.push({
          device_id:   truck.device_id,
          device_name: truck.device_name,
          issue,
        });
      }
    }

    logger.info(
      { checkedDate, trucksWithMovement: movingTrucks.length, alertsInserted },
      "Accountability check complete"
    );

    return {
      checked_date:          checkedDate,
      trucks_with_movement:  movingTrucks.length,
      alerts_inserted:       alertsInserted,
      details,
    };
  } finally {
    client.release();
  }
}

/**
 * Start the daily 10 AM cron job.
 * Call this once after migrations complete.
 */
export function startScheduler(): void {
  // Runs every day at 10:00 AM server time
  cron.schedule("0 10 * * *", async () => {
    logger.info("Running daily accountability check (scheduled)");
    try {
      await runAccountabilityCheck();
    } catch (err) {
      logger.error({ err }, "Scheduled accountability check failed");
    }
  });

  logger.info("Daily accountability check scheduled for 10:00 AM");
}
