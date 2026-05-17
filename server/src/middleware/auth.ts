import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { validateKey } from "../services/api-key-service.js";
import type { Plan } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  plan: Plan;
}

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Public routes that bypass all auth checks
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = new Set([
  "/health",
  "/api/auth/register",
  "/api/auth/login",
  "/api/billing/webhook",
  "/api/billing/plans",
  "/api/pipeline/status",
  "/api/pipeline/estimate",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path);
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") return null;
  return parts[1] ?? null;
}

function verifyJwt(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as {
      sub: string;
      email: string;
      plan: Plan;
    };
    return { id: payload.sub, email: payload.email, plan: payload.plan };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory token blocklist (replace with Redis in production)
// ---------------------------------------------------------------------------

const tokenBlocklist = new Set<string>();

export function blockToken(token: string): void {
  tokenBlocklist.add(token);
}

export function isTokenBlocked(token: string): boolean {
  return tokenBlocklist.has(token);
}

// ---------------------------------------------------------------------------
// authOptional — attaches req.user if credentials are present and valid,
//               but does NOT reject the request when absent
// ---------------------------------------------------------------------------

export async function authOptional(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKeyHeader = req.headers["x-api-key"];
    if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) {
      const user = await validateKey(apiKeyHeader);
      if (user) {
        req.user = user;
      }
      return next();
    }

    const token = extractBearerToken(req.headers.authorization);
    if (token && !isTokenBlocked(token)) {
      const user = verifyJwt(token);
      if (user) {
        req.user = user;
      }
    }
  } catch {
    // Non-blocking — just skip attaching user
  }

  return next();
}

// ---------------------------------------------------------------------------
// authRequired — rejects with 401 when no valid credentials supplied
// ---------------------------------------------------------------------------

export async function authRequired(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Allow public paths through unconditionally
  if (isPublicPath(req.path)) {
    return next();
  }

  try {
    // 1. Try API key first
    const apiKeyHeader = req.headers["x-api-key"];
    if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) {
      const user = await validateKey(apiKeyHeader);
      if (!user) {
        res.status(401).json({ success: false, error: "Invalid API key." });
        return;
      }
      req.user = user;
      return next();
    }

    // 2. Try JWT bearer token
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res
        .status(401)
        .json({ success: false, error: "Authentication required." });
      return;
    }

    if (isTokenBlocked(token)) {
      res.status(401).json({ success: false, error: "Token has been revoked." });
      return;
    }

    const user = verifyJwt(token);
    if (!user) {
      res
        .status(401)
        .json({ success: false, error: "Invalid or expired token." });
      return;
    }

    req.user = user;
    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication error";
    res.status(500).json({ success: false, error: message });
  }
}

// ---------------------------------------------------------------------------
// requirePlan — factory that returns middleware enforcing a plan requirement
// ---------------------------------------------------------------------------

const PLAN_ORDER: Plan[] = ["free", "starter", "pro", "team", "enterprise"];

function planIndex(plan: Plan): number {
  return PLAN_ORDER.indexOf(plan);
}

/**
 * Returns middleware that requires the user's plan to be one of the allowed
 * plans (or any plan at/above the minimum plan in hierarchy).
 *
 * Usage:
 *   router.post("/heavy-feature", authRequired, requirePlan(["pro", "team", "enterprise"]), handler)
 */
export function requirePlan(
  allowedPlans: Plan[]
): (req: Request, res: Response, next: NextFunction) => void {
  const allowedSet = new Set(allowedPlans);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Authentication required." });
      return;
    }

    if (!allowedSet.has(req.user.plan)) {
      const minPlanIndex = Math.min(
        ...Array.from(allowedSet).map(planIndex)
      );
      const minPlan = PLAN_ORDER[minPlanIndex] ?? "pro";
      res.status(403).json({
        success: false,
        error: `This feature requires the ${minPlan} plan or higher.`,
        requiredPlan: minPlan,
        currentPlan: req.user.plan,
      });
      return;
    }

    next();
  };
}
