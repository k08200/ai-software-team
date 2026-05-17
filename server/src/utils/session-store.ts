import fs from "fs/promises";
import path from "path";

export interface SessionRecord {
  sessionId: string;
  projectIdea: string;
  status: "running" | "completed" | "error";
  totalTokens: number;
  roundCount: number;
  finalIssues: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  zipPath?: string;
}

const SESSIONS_FILE = path.join(process.cwd(), "outputs", "sessions.json");

async function readSessions(): Promise<SessionRecord[]> {
  try {
    const data = await fs.readFile(SESSIONS_FILE, "utf-8");
    return JSON.parse(data) as SessionRecord[];
  } catch {
    return [];
  }
}

async function writeSessions(sessions: SessionRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const sessions = await readSessions();
  const existingIndex = sessions.findIndex((s) => s.sessionId === record.sessionId);

  if (existingIndex >= 0) {
    sessions[existingIndex] = record;
  } else {
    sessions.unshift(record);
  }

  // Keep last 50 sessions
  const trimmed = sessions.slice(0, 50);
  await writeSessions(trimmed);
}

export async function getSessions(): Promise<SessionRecord[]> {
  return readSessions();
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const sessions = await readSessions();
  return sessions.find((s) => s.sessionId === sessionId) ?? null;
}
