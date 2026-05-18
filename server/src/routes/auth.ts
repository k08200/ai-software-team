import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  register,
  login,
  getUser,
  changePassword,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  UserNotFoundError,
} from "../services/user-service.js";
import { authRequired, blockToken } from "../middleware/auth.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const RegisterSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(320, "Email too long")
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be under 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit"),
});

const LoginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password must be under 128 characters")
    .regex(/[A-Z]/, "New password must contain at least one uppercase letter")
    .regex(/[0-9]/, "New password must contain at least one digit"),
});

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const { user, token } = await register(parsed.data.email, parsed.data.password);
    res.status(201).json({ success: true, data: { user, token } });
  } catch (err) {
    if (err instanceof EmailAlreadyExistsError) {
      res.status(409).json({ success: false, error: "Email already in use." });
      return;
    }
    const message = err instanceof Error ? err.message : "Registration failed";
    console.error("[auth] register error:", message);
    res.status(500).json({ success: false, error: "Registration failed. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
    });
    return;
  }

  try {
    const { user, token } = await login(parsed.data.email, parsed.data.password);
    res.status(200).json({ success: true, data: { user, token } });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      // Generic message to prevent user enumeration
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }
    const message = err instanceof Error ? err.message : "Login failed";
    console.error("[auth] login error:", message);
    res.status(500).json({ success: false, error: "Login failed. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------

router.get("/me", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  try {
    const user = await getUser(req.user.id);
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ success: false, error: "User not found." });
      return;
    }
    const message = err instanceof Error ? err.message : "Failed to fetch user";
    console.error("[auth] /me error:", message);
    res.status(500).json({ success: false, error: "Failed to fetch user profile." });
  }
});

// ---------------------------------------------------------------------------
// POST /change-password
// ---------------------------------------------------------------------------

router.post("/change-password", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
      details: parsed.error.issues,
    });
    return;
  }

  try {
    await changePassword(
      req.user.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    res.status(200).json({ success: true, data: { message: "Password changed." } });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ success: false, error: "Current password is incorrect." });
      return;
    }
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ success: false, error: "User not found." });
      return;
    }

    const message = err instanceof Error ? err.message : "Password change failed";
    console.error("[auth] change-password error:", message);
    res.status(500).json({ success: false, error: "Failed to change password." });
  }
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

router.post("/logout", authRequired, (req: Request, res: Response): void => {
  // Extract and blocklist the JWT so it can't be reused
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token) {
      blockToken(token);
    }
  }

  res.status(200).json({ success: true, data: { message: "Logged out successfully." } });
});

export default router;
