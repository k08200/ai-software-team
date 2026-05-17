import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys, users } from "../db/schema.js";
import type { ApiKey } from "../db/schema.js";
import type { AuthUser } from "../middleware/auth.js";
import { config } from "../config.js";

const USE_MEMORY = !config.database.url;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY_PREFIX = "sk-ast-";
const KEY_BYTES = 32; // 32 random bytes → 64 hex chars
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 6; // "sk-ast-" + first 6 hex chars

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedKey {
  /** The full raw key — shown only once at creation time */
  key: string;
  /** SHA-256 hex hash stored in DB */
  hash: string;
  /** Short prefix for UI display, e.g. "sk-ast-a1b2c3" */
  prefix: string;
}

export interface ApiKeyPublic {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// generateKey
// ---------------------------------------------------------------------------

export function generateKey(): GeneratedKey {
  const randomHex = crypto.randomBytes(KEY_BYTES).toString("hex");
  const key = `${KEY_PREFIX}${randomHex}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, DISPLAY_PREFIX_LENGTH);

  return { key, hash, prefix };
}

// ---------------------------------------------------------------------------
// createKey
// ---------------------------------------------------------------------------

export interface CreatedApiKey extends ApiKeyPublic {
  /** Raw key — only included on creation, never returned again */
  rawKey: string;
}

export async function createKey(
  userId: string,
  name: string
): Promise<CreatedApiKey> {
  const { key, hash, prefix } = generateKey();

  const [record] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      isActive: true,
    })
    .returning();

  if (!record) {
    throw new Error("Failed to create API key record.");
  }

  return {
    id: record.id,
    name: record.name,
    prefix: record.keyPrefix,
    isActive: record.isActive,
    lastUsedAt: record.lastUsedAt ?? null,
    createdAt: record.createdAt,
    rawKey: key,
  };
}

// ---------------------------------------------------------------------------
// revokeKey
// ---------------------------------------------------------------------------

export async function revokeKey(keyId: string, userId: string): Promise<void> {
  const result = await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    throw new Error("API key not found or you do not own it.");
  }
}

// ---------------------------------------------------------------------------
// listKeys  — returns keys without the hash
// ---------------------------------------------------------------------------

export async function listKeys(userId: string): Promise<ApiKeyPublic[]> {
  const records = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
    .orderBy(apiKeys.createdAt);

  return records.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.keyPrefix,
    isActive: r.isActive,
    lastUsedAt: r.lastUsedAt ?? null,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// validateKey — hash lookup, updates last_used_at on success
// ---------------------------------------------------------------------------

export async function validateKey(rawKey: string): Promise<AuthUser | null> {
  if (USE_MEMORY) return null;   // No API keys in demo/file-based mode

  if (!rawKey.startsWith(KEY_PREFIX)) {
    return null;
  }

  const hash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const [record] = await db
    .select({
      keyId: apiKeys.id,
      userId: apiKeys.userId,
      isActive: apiKeys.isActive,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!record) {
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      plan: users.plan,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, record.userId))
    .limit(1);

  if (!user || !user.isActive) {
    return null;
  }

  // Update last_used_at without awaiting — fire-and-forget (best effort)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.keyId))
    .catch((err: unknown) => {
      console.error("[api-key-service] Failed to update last_used_at:", err);
    });

  return { id: user.id, email: user.email, plan: user.plan };
}
