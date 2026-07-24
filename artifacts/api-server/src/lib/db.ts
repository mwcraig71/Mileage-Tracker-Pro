import { Pool } from "pg";

/**
 * Single shared connection pool for the whole API server.
 * Previously every route file created its own Pool (12 total × 10 default
 * connections), which can exhaust the Postgres connection cap under load.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX ?? "10", 10),
});
