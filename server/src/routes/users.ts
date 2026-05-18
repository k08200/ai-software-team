import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authRequired, blockToken } from "../middleware/auth.js";
import { deleteUser, UserNotFoundError } from "../services/user-service.js";

const router = Router();

router.use(authRequired);

const UserIdParamSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

router.delete("/:userId", async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const parsed = UserIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid user ID.",
    });
    return;
  }

  if (parsed.data.userId !== req.user.id) {
    res.status(403).json({ success: false, error: "You can only delete your own account." });
    return;
  }

  try {
    await deleteUser(req.user.id);

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      blockToken(authHeader.slice(7));
    }

    res.status(200).json({ success: true, data: { message: "Account deleted." } });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ success: false, error: "User not found." });
      return;
    }

    const message = err instanceof Error ? err.message : "Failed to delete account";
    console.error("[users] delete error:", message);
    res.status(500).json({ success: false, error: "Failed to delete account." });
  }
});

export default router;
