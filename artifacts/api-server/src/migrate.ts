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

    logger.info("Database migrations completed");
  } finally {
    client.release();
  }
}
