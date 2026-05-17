import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { config } from "../config.js";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Parse timestamps as JS Date objects (not strings)
// ---------------------------------------------------------------------------

pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value: string) =>
  value === null ? null : new Date(value)
);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (value: string) =>
  value === null ? null : new Date(value)
);

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,               // maximum pool size
  min: 2,                // keep at least 2 connections warm
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});

// ---------------------------------------------------------------------------
// Drizzle instance
// ---------------------------------------------------------------------------

export const db = drizzle(pool, { schema });

// ---------------------------------------------------------------------------
// Graceful shutdown helper — call during SIGTERM / SIGINT
// ---------------------------------------------------------------------------

export async function closePool(): Promise<void> {
  await pool.end();
  console.log("[DB] Connection pool closed.");
}
