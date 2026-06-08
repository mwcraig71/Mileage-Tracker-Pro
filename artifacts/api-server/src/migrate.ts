import { Pool } from "pg";
import { logger } from "./lib/logger";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Run all idempotent schema migrations on startup.
 * Each statement uses IF NOT EXISTS / ON CONFLICT so it is safe to run
 * every time the server starts.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── Pre-existing tables (created by earlier tasks) ───────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id             SERIAL PRIMARY KEY,
        project_number TEXT NOT NULL UNIQUE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS team_leaders (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS log_entries (
        id               SERIAL PRIMARY KEY,
        device_id        TEXT NOT NULL,
        device_name      TEXT NOT NULL,
        start_date       DATE NOT NULL,
        end_date         DATE NOT NULL,
        begin_odometer   NUMERIC NOT NULL,
        end_odometer     NUMERIC NOT NULL,
        indirect_miles   NUMERIC NOT NULL DEFAULT 0,
        personal_miles   NUMERIC NOT NULL DEFAULT 0,
        direct_miles     NUMERIC NOT NULL DEFAULT 0,
        total_miles      NUMERIC NOT NULL DEFAULT 0,
        project_number   TEXT NOT NULL DEFAULT '',
        team_leader_name TEXT NOT NULL DEFAULT '',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Task #5 tables ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS periods (
        id           SERIAL PRIMARY KEY,
        label        TEXT NOT NULL,
        month_key    TEXT NOT NULL UNIQUE,
        finalized    BOOLEAN NOT NULL DEFAULT FALSE,
        finalized_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS log_annotations (
        id               SERIAL PRIMARY KEY,
        period_id        INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
        device_id        TEXT NOT NULL,
        device_name      TEXT NOT NULL DEFAULT '',
        date             DATE NOT NULL,
        begin_odometer   NUMERIC,
        end_odometer     NUMERIC,
        gps_miles        NUMERIC,
        indirect_miles   NUMERIC NOT NULL DEFAULT 0,
        personal_miles   NUMERIC NOT NULL DEFAULT 0,
        direct_miles     NUMERIC NOT NULL DEFAULT 0,
        project_number   TEXT NOT NULL DEFAULT '',
        team_leader_name TEXT NOT NULL DEFAULT '',
        is_exported      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (period_id, device_id, date)
      )
    `);

    // ── Backfill: migrate log_entries → periods + log_annotations ────────────
    // Idempotent: uses ON CONFLICT DO NOTHING throughout.
    // Creates one period per unique calendar month found in log_entries.start_date,
    // then copies each log_entry row into log_annotations under the matching period.
    // Runs only if log_entries has rows and will not overwrite any already-migrated
    // annotation (protected by the UNIQUE(period_id, device_id, date) constraint).
    await client.query(`
      INSERT INTO periods (label, month_key)
      SELECT DISTINCT
        TRIM(TO_CHAR(start_date, 'Month')) || ' ' || TO_CHAR(start_date, 'YYYY') AS label,
        TO_CHAR(start_date, 'YYYY-MM') AS month_key
      FROM log_entries
      ON CONFLICT (month_key) DO NOTHING
    `);

    await client.query(`
      INSERT INTO log_annotations
        (period_id, device_id, device_name, date,
         begin_odometer, end_odometer, gps_miles,
         indirect_miles, personal_miles, direct_miles,
         project_number, team_leader_name)
      SELECT
        p.id,
        le.device_id,
        le.device_name,
        le.start_date,
        le.begin_odometer,
        le.end_odometer,
        NULL,
        le.indirect_miles,
        le.personal_miles,
        le.direct_miles,
        le.project_number,
        le.team_leader_name
      FROM log_entries le
      JOIN periods p ON p.month_key = TO_CHAR(le.start_date, 'YYYY-MM')
      ON CONFLICT (period_id, device_id, date) DO NOTHING
    `);

    // ── Task #6 table ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS driver_sessions (
        id             SERIAL PRIMARY KEY,
        driver_name    TEXT NOT NULL,
        device_id      TEXT NOT NULL,
        project_number TEXT NOT NULL DEFAULT '',
        started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at       TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS driver_sessions_device_started
        ON driver_sessions (device_id, started_at)
    `);

    logger.info("Database migrations completed");
  } finally {
    client.release();
  }
}
