import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, and, gte } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, PLAN_LIMITS } from "../db/schema.js";
import { config } from "../config.js";
import type { User, NewUser, Plan } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: string;
  email: string;
  plan: Plan;
  emailVerified: boolean;
  stripeCustomerId: string | null;
  runCountCurrentPeriod: number;
  periodStart: Date;
  createdAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = "UserNotFoundError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email already in use: ${email}`);
    this.name = "EmailAlreadyExistsError";
  }
}

export class QuotaExceededError extends Error {
  readonly plan: Plan;
  readonly limit: number | null;
  readonly current: number;

  constructor(plan: Plan, limit: number | null, current: number) {
    super(
      `Run quota exceeded for plan "${plan}". Limit: ${limit ?? "unlimited"}, used: ${current}.`
    );
    this.name = "QuotaExceededError";
    this.plan = plan;
    this.limit = limit;
    this.current = current;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    emailVerified: user.emailVerified,
    stripeCustomerId: user.stripeCustomerId ?? null,
    runCountCurrentPeriod: user.runCountCurrentPeriod,
    periodStart: user.periodStart,
    createdAt: user.createdAt,
  };
}

function signToken(user: User): string {
  return jwt.sign(
    { sub: user.id, email: user.email, plan: user.plan },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn } as jwt.SignOptions
  );
}

/**
 * Returns the start of the current monthly billing period.
 * Resets on the same day-of-month each month as the user's period_start.
 */
function isInCurrentPeriod(periodStart: Date): boolean {
  const now = new Date();
  const start = new Date(periodStart);
  // Period is valid for the current calendar month from its start date
  const monthDiff =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  return monthDiff < 1;
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

export async function register(
  email: string,
  password: string
): Promise<AuthResult> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    throw new EmailAlreadyExistsError(email);
  }

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);

  const [created] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      plan: "free",
      runCountCurrentPeriod: 0,
      periodStart: new Date(),
      isActive: true,
      emailVerified: false,
    } satisfies Omit<NewUser, "id" | "createdAt" | "updatedAt">)
    .returning();

  if (!created) {
    throw new Error("Failed to create user record.");
  }

  const token = signToken(created);
  return { user: toPublicUser(created), token };
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

export async function login(
  email: string,
  password: string
): Promise<AuthResult> {
  const [found] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), eq(users.isActive, true)))
    .limit(1);

  if (!found) {
    throw new InvalidCredentialsError();
  }

  const valid = await bcrypt.compare(password, found.passwordHash);
  if (!valid) {
    throw new InvalidCredentialsError();
  }

  const token = signToken(found);
  return { user: toPublicUser(found), token };
}

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------

export async function getUser(id: string): Promise<PublicUser> {
  const [found] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!found) {
    throw new UserNotFoundError(id);
  }

  return toPublicUser(found);
}

// ---------------------------------------------------------------------------
// updatePlan
// ---------------------------------------------------------------------------

export async function updatePlan(userId: string, plan: Plan): Promise<PublicUser> {
  const [updated] = await db
    .update(users)
    .set({ plan })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new UserNotFoundError(userId);
  }

  return toPublicUser(updated);
}

// ---------------------------------------------------------------------------
// checkRunQuota
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is within their quota.
 * Throws QuotaExceededError if they have hit the limit.
 * Resets the counter automatically when a new billing period starts.
 */
export async function checkRunQuota(userId: string): Promise<boolean> {
  const [found] = await db
    .select({
      id: users.id,
      plan: users.plan,
      runCountCurrentPeriod: users.runCountCurrentPeriod,
      periodStart: users.periodStart,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!found) {
    throw new UserNotFoundError(userId);
  }

  const limit = PLAN_LIMITS[found.plan];

  // Enterprise (unlimited) — always allow
  if (limit === null) {
    return true;
  }

  // Check if period has rolled over (new calendar month)
  const periodExpired = !isInCurrentPeriod(found.periodStart);

  if (periodExpired) {
    // Reset the counter for the new period — the actual increment happens
    // in incrementRunCount, but we return true to allow this run
    await db
      .update(users)
      .set({ runCountCurrentPeriod: 0, periodStart: new Date() })
      .where(eq(users.id, userId));
    return true;
  }

  if (found.runCountCurrentPeriod >= limit) {
    throw new QuotaExceededError(found.plan, limit, found.runCountCurrentPeriod);
  }

  return true;
}

// ---------------------------------------------------------------------------
// incrementRunCount
// ---------------------------------------------------------------------------

export async function incrementRunCount(userId: string): Promise<void> {
  const [found] = await db
    .select({
      id: users.id,
      runCountCurrentPeriod: users.runCountCurrentPeriod,
      periodStart: users.periodStart,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!found) {
    throw new UserNotFoundError(userId);
  }

  const periodExpired = !isInCurrentPeriod(found.periodStart);

  if (periodExpired) {
    // New period: start fresh with count = 1
    await db
      .update(users)
      .set({ runCountCurrentPeriod: 1, periodStart: new Date() })
      .where(eq(users.id, userId));
  } else {
    await db
      .update(users)
      .set({
        runCountCurrentPeriod: found.runCountCurrentPeriod + 1,
      })
      .where(eq(users.id, userId));
  }
}
