import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const planEnum = pgEnum("plan", [
  "free",
  "starter",
  "pro",
  "team",
  "enterprise",
]);

export const pipelineStatusEnum = pgEnum("pipeline_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const stripeEventStatusEnum = pgEnum("stripe_event_status", [
  "pending",
  "processed",
  "failed",
]);

// ---------------------------------------------------------------------------
// Plan limits (referenced by business logic)
// ---------------------------------------------------------------------------

export const PLAN_LIMITS: Record<string, number | null> = {
  free: 3,
  starter: 30,
  pro: 150,
  team: 500,
  enterprise: null, // unlimited
} as const;

export type Plan = "free" | "starter" | "pro" | "team" | "enterprise";

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    plan: planEnum("plan").notNull().default("free"),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    // Monthly rolling quota tracking
    runCountCurrentPeriod: integer("run_count_current_period").notNull().default(0),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete / account status
    isActive: boolean("is_active").notNull().default(true),
    emailVerified: boolean("email_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_stripe_customer_idx").on(table.stripeCustomerId),
    index("users_plan_idx").on(table.plan),
    index("users_created_at_idx").on(table.createdAt),
  ]
);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

// ---------------------------------------------------------------------------
// api_keys
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    // Stored as SHA-256 hex; the raw key is shown only at creation
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    // First 12 chars of raw key (e.g. "sk-ast-abc123") for display in UI
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("api_keys_hash_idx").on(table.keyHash),
    index("api_keys_user_id_idx").on(table.userId),
    index("api_keys_created_at_idx").on(table.createdAt),
  ]
);

export type ApiKey = InferSelectModel<typeof apiKeys>;
export type NewApiKey = InferInsertModel<typeof apiKeys>;

// ---------------------------------------------------------------------------
// pipeline_runs
// ---------------------------------------------------------------------------

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectIdea: text("project_idea").notNull(),
    status: pipelineStatusEnum("status").notNull().default("queued"),
    // Token accounting
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull().default(0),
    // Execution metadata
    roundsCompleted: integer("rounds_completed").notNull().default(0),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    // Full output stored as JSONB for later retrieval
    outputData: jsonb("output_data"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pipeline_runs_session_id_idx").on(table.sessionId),
    index("pipeline_runs_user_id_idx").on(table.userId),
    index("pipeline_runs_status_idx").on(table.status),
    index("pipeline_runs_created_at_idx").on(table.createdAt),
    index("pipeline_runs_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export type PipelineRun = InferSelectModel<typeof pipelineRuns>;
export type NewPipelineRun = InferInsertModel<typeof pipelineRuns>;

// ---------------------------------------------------------------------------
// usage_events
// ---------------------------------------------------------------------------

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id"),
    pipelineRunId: uuid("pipeline_run_id").references(() => pipelineRuns.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 50 }).notNull(), // "pipeline_run", "token_usage"
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    // Billing period this event belongs to (year-month, e.g. "2026-05")
    billingPeriod: varchar("billing_period", { length: 7 }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_events_user_id_idx").on(table.userId),
    index("usage_events_session_id_idx").on(table.sessionId),
    index("usage_events_billing_period_idx").on(table.billingPeriod),
    index("usage_events_created_at_idx").on(table.createdAt),
    index("usage_events_user_period_idx").on(table.userId, table.billingPeriod),
  ]
);

export type UsageEvent = InferSelectModel<typeof usageEvents>;
export type NewUsageEvent = InferInsertModel<typeof usageEvents>;

// ---------------------------------------------------------------------------
// stripe_events  (idempotent webhook log)
// ---------------------------------------------------------------------------

export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stripe's own event ID (e.g. "evt_1NxxxxxABC") — unique to avoid reprocessing
    stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    status: stripeEventStatusEnum("status").notNull().default("pending"),
    // Full raw payload stored for debugging / reprocessing
    payload: jsonb("payload").notNull(),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stripe_events_stripe_event_id_idx").on(table.stripeEventId),
    index("stripe_events_event_type_idx").on(table.eventType),
    index("stripe_events_status_idx").on(table.status),
    index("stripe_events_created_at_idx").on(table.createdAt),
  ]
);

export type StripeEvent = InferSelectModel<typeof stripeEvents>;
export type NewStripeEvent = InferInsertModel<typeof stripeEvents>;

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  pipelineRuns: many(pipelineRuns),
  usageEvents: many(usageEvents),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const pipelineRunsRelations = relations(pipelineRuns, ({ one, many }) => ({
  user: one(users, {
    fields: [pipelineRuns.userId],
    references: [users.id],
  }),
  usageEvents: many(usageEvents),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(users, {
    fields: [usageEvents.userId],
    references: [users.id],
  }),
  pipelineRun: one(pipelineRuns, {
    fields: [usageEvents.pipelineRunId],
    references: [pipelineRuns.id],
  }),
}));
