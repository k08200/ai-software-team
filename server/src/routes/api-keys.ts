import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authRequired } from "../middleware/auth.js";
import {
  createKey,
  revokeKey,
  listKeys,
} from "../services/api-key-service.js";

const router = Router();

// All routes in this file require authentication
router.use(authRequired);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CreateKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be under 100 characters")
    .trim(),
});

const KeyIdParamSchema = z.object({
  keyId: z.string().min(1, "Key ID is required"),
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

router.get("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  try {
    const keys = await listKeys(req.user.id);
    res.status(200).json({ success: true, data: { keys } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list API keys";
    console.error("[api-keys] list error:", message);
    res.status(500).json({ success: false, error: "Failed to retrieve API keys." });
  }
});

// ---------------------------------------------------------------------------
// POST /   — creates a new key; raw key is returned ONCE
// ---------------------------------------------------------------------------

router.post("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const parsed = CreateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const key = await createKey(req.user.id, parsed.data.name);
    res.status(201).json({
      success: true,
      data: {
        key,
        warning:
          "Store this key securely — it will not be shown again.",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create API key";
    console.error("[api-keys] create error:", message);
    res.status(500).json({ success: false, error: "Failed to create API key." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:keyId
// ---------------------------------------------------------------------------

router.delete("/:keyId", async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const paramsParsed = KeyIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({
      success: false,
      error: paramsParsed.error.issues[0]?.message ?? "Invalid key ID",
    });
    return;
  }

  try {
    await revokeKey(paramsParsed.data.keyId, req.user.id);
    res.status(200).json({ success: true, data: { message: "API key revoked." } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to revoke key";

    if (message.includes("not found") || message.includes("do not own")) {
      res.status(404).json({ success: false, error: "API key not found." });
      return;
    }

    console.error("[api-keys] revoke error:", message);
    res.status(500).json({ success: false, error: "Failed to revoke API key." });
  }
});

export default router;
