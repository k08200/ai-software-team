import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { config } from "./config.js";
import pipelineRouter from "./routes/pipeline.js";
import authRouter from "./routes/auth.js";
import apiKeysRouter from "./routes/api-keys.js";
import billingRouter from "./routes/billing.js";
import usersRouter from "./routes/users.js";
import { scheduleCleanup } from "./utils/cleanup.js";

const app = express();

// ── Outputs directory ────────────────────────────────────────────────────────
const outputsDir = path.join(process.cwd(), "outputs");
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}
const previewsDir = path.join(process.cwd(), "previews");
if (!fs.existsSync(previewsDir)) {
  fs.mkdirSync(previewsDir, { recursive: true });
}

// ── Rate limiters ────────────────────────────────────────────────────────────
const pipelineLimiter = rateLimit({
  windowMs: config.rateLimit.pipelineWindowMs,
  max: config.rateLimit.pipelineMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Too many requests. Maximum ${config.rateLimit.pipelineMax} pipeline runs per 15 minutes.` },
  skip: (req) => req.method !== "POST",
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again in 15 minutes." },
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.clientOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
}));

// Stripe webhook needs raw body — mount BEFORE express.json()
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "10kb" }));
app.use(generalLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/keys", apiKeysRouter);
app.use("/api/billing", billingRouter);
app.use("/api/users", usersRouter);
app.use("/api/pipeline", pipelineLimiter, pipelineRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    provider: config.llm.provider,
    model: config.llm.model,
    timestamp: new Date().toISOString(),
  });
});

// ── Static client (production) ───────────────────────────────────────────────
if (config.nodeEnv === "production") {
  const clientDist = path.join(process.cwd(), "public");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }
}

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server Error]", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ── Listen ────────────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  console.log(`\n🤖 AI Software Engineering Team v2.0`);
  console.log(`   Server: http://localhost:${config.port}`);
  console.log(`   LLM:    ${config.llm.provider} (${config.llm.model})`);
  console.log(`   Profile: ${config.pipeline.profile}`);
  console.log(`   Rounds: min=${config.pipeline.minRounds} max=${config.pipeline.maxRounds}`);
  console.log(`   DB:     ${config.database.url ? "PostgreSQL connected" : "No DB (file-based mode)"}`);
  console.log(`   Stripe: ${config.stripe.secretKey ? "enabled" : "disabled"}\n`);

  scheduleCleanup();
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

export default app;
