/**
 * Standalone migration runner — execute with:
 *   npx tsx src/db/migrate.ts
 *
 * Strategy:
 *  1. Ensure `schema_migrations` table exists.
 *  2. Read all *.sql files from src/db/migrations/ in lexicographic order.
 *  3. Skip migrations already recorded in `schema_migrations`.
 *  4. Execute each pending migration inside a transaction.
 *  5. Record the applied migration on success.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { config } from "../config.js";

const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

const ENSURE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         SERIAL PRIMARY KEY,
    filename   VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`;

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename"
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function applyMigration(
  pool: Pool,
  filename: string,
  sql: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
    await client.query("COMMIT");
    console.log(`[migrate] Applied: ${filename}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  console.log("[migrate] Starting migration runner…");
  console.log(`[migrate] Migrations dir: ${MIGRATIONS_DIR}`);

  const pool = new Pool({ connectionString: config.database.url });

  try {
    // Ensure tracking table exists
    await pool.query(ENSURE_TRACKING_TABLE);

    const applied = await getAppliedMigrations(pool);

    // Read migration files in sorted order
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("[migrate] No migration files found.");
      return;
    }

    let pendingCount = 0;
    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`[migrate] Already applied: ${filename}`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, "utf-8").trim();

      if (!sql) {
        console.warn(`[migrate] Skipping empty file: ${filename}`);
        continue;
      }

      await applyMigration(pool, filename, sql);
      pendingCount++;
    }

    if (pendingCount === 0) {
      console.log("[migrate] Database is up to date.");
    } else {
      console.log(`[migrate] Applied ${pendingCount} migration(s).`);
    }
  } finally {
    await pool.end();
    console.log("[migrate] Done.");
  }
}

main().catch((err) => {
  console.error("[migrate] Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
