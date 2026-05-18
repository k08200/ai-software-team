import * as vscode from "vscode";

// ── Types matching the server's SSEEventType and SessionRecord ────────────────

export type SSEEventType =
  | "pipeline_start"
  | "agent_start"
  | "agent_thinking"
  | "agent_output"
  | "agent_complete"
  | "agent_error"
  | "round_start"
  | "round_complete"
  | "issues_update"
  | "pipeline_complete"
  | "pipeline_error"
  | "token_update"
  | "file_saved";

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

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

export interface ServerStatus {
  status: string;
  model: string;
  maxRounds: number;
  timestamp: string;
}

export interface PipelineRunResult {
  sessionId?: string;
  success: boolean;
  cancelled: boolean;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfig(): { apiUrl: string; apiKey: string } {
  const config = vscode.workspace.getConfiguration("aiTeam");
  const rawUrl = (config.get<string>("apiUrl") ?? "http://localhost:3001").replace(/\/$/, "");
  const apiKey = config.get<string>("apiKey") ?? "";
  return { apiUrl: rawUrl, apiKey };
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    if (apiKey.startsWith("sk-ast-")) {
      headers["x-api-key"] = apiKey;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }
  return headers;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Stream a pipeline run via SSE.
 *
 * @param idea        Project idea text
 * @param onEvent     Callback invoked for each parsed SSE event
 * @param signal      AbortSignal for cancellation
 * @returns           PipelineRunResult — always resolves, never rejects
 */
export async function runPipeline(
  idea: string,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal
): Promise<PipelineRunResult> {
  const { apiUrl, apiKey } = getConfig();

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/pipeline/run`, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ idea }),
      signal,
    });
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "AbortError") {
      return { success: false, cancelled: true };
    }
    return {
      success: false,
      cancelled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) {
    let errorText = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      errorText = body.error ?? errorText;
    } catch {
      // ignore JSON parse failure
    }
    return { success: false, cancelled: false, error: errorText };
  }

  if (!response.body) {
    return { success: false, cancelled: false, error: "Response body is null" };
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let currentEventType = "";
  let sessionId: string | undefined;

  try {
    while (true) {
      let done: boolean;
      let value: Uint8Array | undefined;

      try {
        ({ done, value } = await reader.read());
      } catch (readErr: unknown) {
        if ((readErr as { name?: string }).name === "AbortError") {
          return { success: false, cancelled: true, sessionId };
        }
        throw readErr;
      }

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith(": ")) {
          // SSE comment / heartbeat — skip
          continue;
        }

        if (line.startsWith("event: ")) {
          currentEventType = line.slice("event: ".length).trim();
          continue;
        }

        if (line.startsWith("data: ")) {
          const rawData = line.slice("data: ".length).trim();
          try {
            const data = JSON.parse(rawData) as Record<string, unknown>;
            const event: SSEEvent = {
              type: currentEventType as SSEEventType,
              data,
            };
            onEvent(event);

            // Track the sessionId from pipeline_start or pipeline_complete
            if (
              (event.type === "pipeline_start" || event.type === "pipeline_complete") &&
              typeof data["sessionId"] === "string"
            ) {
              sessionId = data["sessionId"] as string;
            }
          } catch {
            // Malformed JSON in SSE data — skip silently
          }
          currentEventType = "";
          continue;
        }

        if (line === "") {
          // Empty line = end of SSE message block
          currentEventType = "";
        }
      }
    }
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "AbortError") {
      return { success: false, cancelled: true, sessionId };
    }
    return {
      success: false,
      cancelled: false,
      error: err instanceof Error ? err.message : String(err),
      sessionId,
    };
  }

  return { success: true, cancelled: false, sessionId };
}

/**
 * Fetch the list of recent pipeline sessions (up to 50).
 */
export async function getHistory(): Promise<SessionRecord[]> {
  const { apiUrl, apiKey } = getConfig();

  const response = await fetch(`${apiUrl}/api/pipeline/sessions`, {
    headers: buildHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch history: HTTP ${response.status}`);
  }

  return response.json() as Promise<SessionRecord[]>;
}

/**
 * Fetch details for a single session.
 */
export async function getSessionDetails(sessionId: string): Promise<SessionRecord> {
  const { apiUrl, apiKey } = getConfig();

  const response = await fetch(`${apiUrl}/api/pipeline/sessions/${sessionId}`, {
    headers: buildHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(`Session not found: HTTP ${response.status}`);
  }

  return response.json() as Promise<SessionRecord>;
}

/**
 * Fetch the server status / health.
 */
export async function getStatus(): Promise<ServerStatus> {
  const { apiUrl, apiKey } = getConfig();

  const response = await fetch(`${apiUrl}/api/pipeline/status`, {
    headers: buildHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(`Server status check failed: HTTP ${response.status}`);
  }

  return response.json() as Promise<ServerStatus>;
}

/**
 * Return the download URL for a given session ZIP.
 * Callers can pass this to vscode.env.openExternal.
 */
export function getDownloadUrl(sessionId: string): string {
  const { apiUrl } = getConfig();
  return `${apiUrl}/api/pipeline/download/${sessionId}`;
}

/**
 * Return the web dashboard URL.
 */
export function getDashboardUrl(): string {
  const { apiUrl } = getConfig();
  return apiUrl;
}

/**
 * Quick connectivity check. Returns true if the server responded to /health.
 */
export async function checkConnection(): Promise<boolean> {
  const { apiUrl } = getConfig();
  try {
    const response = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
