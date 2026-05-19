import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { PipelineOrchestrator } from "../pipeline/orchestrator.js";
import { estimateCost } from "../utils/cost-estimator.js";
import { config } from "../config.js";
import { saveSession, getSessions, getSession } from "../utils/session-store.js";
import { authRequired } from "../middleware/auth.js";
import { checkRunQuota, incrementRunCount, QuotaExceededError } from "../services/user-service.js";
import { enqueue } from "../services/queue-service.js";
import type { SSEEvent } from "../types.js";

const router = Router();

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

router.post("/run", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const { idea } = req.body as { idea?: string };

  if (!idea || typeof idea !== "string" || idea.trim().length < 5) {
    res.status(400).json({ error: "Project idea must be at least 5 characters." });
    return;
  }

  if (idea.length > 1000) {
    res.status(400).json({ error: "Project idea must be under 1000 characters." });
    return;
  }

  const sessionId = uuidv4();

  try {
    await checkRunQuota(req.user.id);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      res.status(403).json({
        success: false,
        error: `Run quota exceeded for ${err.plan} plan.`,
        plan: err.plan,
        limit: err.limit,
        current: err.current,
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Failed to check quota";
    console.error("[pipeline] quota check error:", message);
    res.status(500).json({ success: false, error: "Failed to check run quota." });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  const orchestrator = new PipelineOrchestrator();
  const userId = req.user.id;

  try {
    await enqueue(
      sessionId,
      idea.trim(),
      userId,
      (event) => sendSSE(res, event),
      async (queuedIdea, queuedSessionId, queuedUserId, emit) => {
        await orchestrator.run(queuedIdea, queuedSessionId, queuedUserId, emit);
        await incrementRunCount(queuedUserId);
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendSSE(res, { type: "pipeline_error", data: { message } });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

router.get("/download/:sessionId", (req: Request, res: Response): void => {
  const { sessionId } = req.params;

  // Validate sessionId is a valid UUID to prevent path traversal
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  const zipPath = path.join(process.cwd(), "outputs", `${sessionId}.zip`);

  if (!fs.existsSync(zipPath)) {
    res.status(404).json({ error: "Output not found. Run the pipeline first." });
    return;
  }

  res.download(zipPath, `ai-project-${sessionId.slice(0, 8)}.zip`);
});

router.get("/preview/:sessionId/:filename", (req: Request, res: Response): void => {
  const { sessionId, filename } = req.params;

  // Validate inputs to prevent path traversal
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  // Only allow safe filenames
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename." });
    return;
  }

  const filePath = path.join(process.cwd(), "outputs", sessionId, filename);
  const resolvedPath = path.resolve(filePath);
  const outputsDir = path.resolve(path.join(process.cwd(), "outputs"));

  // Ensure the resolved path is within the outputs directory
  if (!resolvedPath.startsWith(outputsDir)) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  if (!fs.existsSync(resolvedPath)) {
    res.status(404).json({ error: "File not found." });
    return;
  }

  res.sendFile(resolvedPath);
});

router.get("/status", (_req: Request, res: Response): void => {
  res.json({
    status: "ok",
    provider: config.llm.provider,
    model: config.llm.model,
    profile: config.pipeline.profile,
    maxRounds: config.pipeline.maxRounds,
    timestamp: new Date().toISOString(),
  });
});

router.get("/estimate", (req: Request, res: Response): void => {
  const provider = (req.query.provider as string) ?? config.llm.provider;
  const model = (req.query.model as string) ?? config.llm.model;
  const rounds = parseInt((req.query.rounds as string) ?? process.env.MAX_ROUNDS ?? "3", 10);

  if (isNaN(rounds) || rounds < 1 || rounds > 10) {
    res.status(400).json({ error: "rounds must be between 1 and 10" });
    return;
  }

  const estimate = estimateCost(model, rounds, provider);
  res.json(estimate);
});

router.get("/sessions", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  try {
    const sessions = await getSessions();
    res.json(sessions.filter((session) => session.userId === req.user?.id));
  } catch (error) {
    res.status(500).json({ error: "Failed to read sessions" });
  }
});

router.get("/sessions/:sessionId", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const { sessionId } = req.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }

  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  if (session.userId !== req.user.id) {
    res.status(404).json({ error: "Session not found." });
    return;
  }

  res.json(session);
});

export { saveSession };
export default router;
