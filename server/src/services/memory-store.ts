/**
 * In-memory user store — used automatically when DATABASE_URL is not set.
 * All data lives in process memory and resets on server restart.
 * Drop-in compatible with the Drizzle-based user-service operations.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { PublicUser, AuthResult } from "./user-service.js";
import {
  InvalidCredentialsError,
  EmailAlreadyExistsError,
  UserNotFoundError,
} from "./user-service.js";

// ---------------------------------------------------------------------------
// Internal shape (mirrors DB schema)
// ---------------------------------------------------------------------------

interface MemUser {
  id: string;
  email: string;
  passwordHash: string;
  plan: "free" | "starter" | "pro" | "team" | "enterprise";
  emailVerified: boolean;
  stripeCustomerId: string | null;
  runCountCurrentPeriod: number;
  periodStart: Date;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = new Map<string, MemUser>();         // id → user
const emailIndex = new Map<string, string>();      // email → id
let nextId = 1;

function newId(): string {
  return `mem-user-${nextId++}`;
}

function toPublic(u: MemUser): PublicUser {
  return {
    id: u.id,
    email: u.email,
    plan: u.plan,
    emailVerified: u.emailVerified,
    stripeCustomerId: u.stripeCustomerId,
    runCountCurrentPeriod: u.runCountCurrentPeriod,
    periodStart: u.periodStart,
    createdAt: u.createdAt,
  };
}

function sign(u: MemUser): string {
  return jwt.sign(
    { sub: u.id, email: u.email, plan: u.plan },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn } as jwt.SignOptions,
  );
}

// ---------------------------------------------------------------------------
// Operations — same signatures as user-service
// ---------------------------------------------------------------------------

export async function memRegister(
  email: string,
  password: string,
): Promise<AuthResult> {
  const key = email.toLowerCase();
  if (emailIndex.has(key)) throw new EmailAlreadyExistsError(email);

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  const id = newId();
  const user: MemUser = {
    id,
    email: key,
    passwordHash,
    plan: "enterprise",   // demo users get unlimited access
    emailVerified: true,
    stripeCustomerId: null,
    runCountCurrentPeriod: 0,
    periodStart: new Date(),
    createdAt: new Date(),
  };

  store.set(id, user);
  emailIndex.set(key, id);

  return { user: toPublic(user), token: sign(user) };
}

export async function memLogin(
  email: string,
  password: string,
): Promise<AuthResult> {
  const key = email.toLowerCase();
  const id = emailIndex.get(key);
  const user = id ? store.get(id) : undefined;

  if (!user) throw new InvalidCredentialsError();

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new InvalidCredentialsError();

  return { user: toPublic(user), token: sign(user) };
}

export function memGetUser(id: string): PublicUser {
  const user = store.get(id);
  if (!user) throw new UserNotFoundError(id);
  return toPublic(user);
}

export function memCheckRunQuota(_userId: string): boolean {
  return true;   // unlimited in demo mode
}

export function memIncrementRunCount(_userId: string): void {
  // no-op in demo mode
}
