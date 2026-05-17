import fs from "fs/promises";
import path from "path";

const OUTPUT_DIR = path.join(process.cwd(), "outputs");
const TTL_HOURS = parseInt(process.env.OUTPUT_TTL_HOURS ?? "24", 10);
const TTL_MS = TTL_HOURS * 60 * 60 * 1000;

/**
 * Delete output directories and zip files older than OUTPUT_TTL_HOURS.
 */
export async function cleanupOldOutputs(): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;
  const now = Date.now();

  let entries: string[];
  try {
    entries = await fs.readdir(OUTPUT_DIR);
  } catch {
    return { deleted, errors };
  }

  for (const entry of entries) {
    // Skip sessions.json
    if (entry === "sessions.json") continue;

    const fullPath = path.join(OUTPUT_DIR, entry);
    try {
      const stat = await fs.stat(fullPath);
      const ageMs = now - stat.mtimeMs;

      if (ageMs > TTL_MS) {
        await fs.rm(fullPath, { recursive: true, force: true });
        deleted++;
        console.log(`[Cleanup] Deleted old output: ${entry} (age: ${Math.round(ageMs / 3600000)}h)`);
      }
    } catch {
      errors++;
    }
  }

  if (deleted > 0 || errors > 0) {
    console.log(`[Cleanup] Done: ${deleted} deleted, ${errors} errors`);
  }

  return { deleted, errors };
}

/**
 * Schedule periodic cleanup. Runs every hour.
 */
export function scheduleCleanup(): void {
  // Run once on startup after a 5-minute delay
  setTimeout(() => {
    cleanupOldOutputs().catch((e) => console.error("[Cleanup] Error:", e));
  }, 5 * 60 * 1000);

  // Then run every hour
  setInterval(() => {
    cleanupOldOutputs().catch((e) => console.error("[Cleanup] Error:", e));
  }, 60 * 60 * 1000);
}
