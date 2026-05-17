import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pipelineRouter from "./routes/pipeline.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

// Validate required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY environment variable is required.");
  process.exit(1);
}

const app = express();

// Ensure outputs directory exists
const outputsDir = path.join(process.cwd(), "outputs");
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: CLIENT_ORIGIN,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "10kb" }));

// Routes
app.use("/api/pipeline", pipelineRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server Error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`AI Software Team server running on http://localhost:${PORT}`);
  console.log(`Model: ${process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6"}`);
  console.log(`Max rounds: ${process.env.MAX_ROUNDS ?? "3"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down...");
  server.close(() => process.exit(0));
});

export default app;
