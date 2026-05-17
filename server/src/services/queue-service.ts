import PQueue from "p-queue";
import { config } from "../config.js";
import type { SSEEvent } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SSEEmitter = (event: SSEEvent) => void;

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
}

interface QueueEntry {
  sessionId: string;
  userId: string;
  enqueuedAt: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Single shared queue for all pipeline executions
const PIPELINE_TIMEOUT_MS = 30 * 60 * 1000; // 30-minute max per job

const queue = new PQueue({
  concurrency: config.pipeline.maxConcurrent,
  timeout: PIPELINE_TIMEOUT_MS,
});

// Track sessions currently in-flight (running)
const activeSessions = new Map<string, QueueEntry>();

// Track sessions that are queued but not yet running
const pendingSessionIds = new Set<string>();

// Monotonic count of completed jobs since startup
let completedCount = 0;

// ---------------------------------------------------------------------------
// enqueue
// ---------------------------------------------------------------------------

/**
 * Enqueues a pipeline run.
 *
 * The `runPipeline` function is imported lazily to avoid a circular dep at
 * module load time. The caller passes in the orchestration logic via
 * `runFn` — this keeps the queue service decoupled from the orchestrator.
 */
export async function enqueue(
  sessionId: string,
  idea: string,
  userId: string,
  emit: SSEEmitter,
  runFn: (
    idea: string,
    sessionId: string,
    userId: string,
    emit: SSEEmitter
  ) => Promise<void>
): Promise<void> {
  if (activeSessions.has(sessionId) || pendingSessionIds.has(sessionId)) {
    throw new Error(`Session ${sessionId} is already queued or running.`);
  }

  pendingSessionIds.add(sessionId);

  // Calculate queue position for this session (pending + active + 1)
  const queuePosition = queue.size + queue.pending + 1;

  emit({
    type: "pipeline_start",
    data: {
      sessionId,
      queuePosition,
      message:
        queuePosition > 1
          ? `Your pipeline is queued at position ${queuePosition}. Please wait…`
          : "Starting pipeline…",
    },
  });

  // Emit queue position updates to the client while waiting
  let positionInterval: NodeJS.Timeout | null = null;

  if (queuePosition > 1) {
    positionInterval = setInterval(() => {
      const currentPosition = queue.size - queue.pending + 1;
      emit({
        type: "pipeline_start",
        data: {
          sessionId,
          queuePosition: currentPosition,
          message: `Queue position: ${currentPosition}`,
        },
      });
    }, 5_000);
  }

  await queue.add(async () => {
    if (positionInterval !== null) {
      clearInterval(positionInterval);
      positionInterval = null;
    }

    pendingSessionIds.delete(sessionId);
    activeSessions.set(sessionId, { sessionId, userId, enqueuedAt: Date.now() });

    try {
      await runFn(idea, sessionId, userId, emit);
    } finally {
      activeSessions.delete(sessionId);
      completedCount++;
    }
  });
}

// ---------------------------------------------------------------------------
// getQueueStats
// ---------------------------------------------------------------------------

export function getQueueStats(): QueueStats {
  return {
    pending: queue.size,           // jobs waiting to start (in the queue buffer)
    active: queue.pending,         // jobs currently executing
    completed: completedCount,
  };
}

// ---------------------------------------------------------------------------
// isRunning
// ---------------------------------------------------------------------------

export function isRunning(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

// ---------------------------------------------------------------------------
// isQueued (bonus helper)
// ---------------------------------------------------------------------------

export function isQueued(sessionId: string): boolean {
  return pendingSessionIds.has(sessionId);
}

// ---------------------------------------------------------------------------
// pause / resume (useful for graceful shutdown)
// ---------------------------------------------------------------------------

export function pauseQueue(): void {
  queue.pause();
}

export function resumeQueue(): void {
  queue.start();
}

export async function drainQueue(): Promise<void> {
  await queue.onIdle();
}
