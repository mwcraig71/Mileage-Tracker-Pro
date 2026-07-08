import { Pool } from "pg";

/**
 * Single shared PostgreSQL connection pool for the whole API server.
 * Every route file and the scheduler import this instead of each creating
 * its own `new Pool()`, which previously multiplied open connections.
 */
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
