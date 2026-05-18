import { useCallback, useRef } from "react";
import { usePipelineStore } from "../store/pipeline-store.js";

const API_BASE = "/api/pipeline";

export function usePipeline() {
  const store = usePipelineStore();
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (idea: string) => {
      if (store.status === "running") return;

      store.startPipeline();

      // Close existing SSE connection
      eventSourceRef.current?.close();
      abortControllerRef.current?.abort();

      abortControllerRef.current = new AbortController();

      try {
        const token = localStorage.getItem("auth_token");
        // Use fetch with streaming for SSE (allows POST body)
        const response = await fetch(`${API_BASE}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ idea }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const error = await response.json() as { error: string };
          throw new Error(error.error ?? `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith("data: ") && currentEventType) {
              try {
                const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
                store.handleSSEEvent(currentEventType, data);
                currentEventType = "";
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Unknown error";
        store.handleSSEEvent("pipeline_error", { message });
      }
    },
    [store],
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    eventSourceRef.current?.close();
    store.resetPipeline();
  }, [store]);

  const download = useCallback(() => {
    const { sessionId } = usePipelineStore.getState();
    if (!sessionId) return;
    window.open(`${API_BASE}/download/${sessionId}`, "_blank");
  }, []);

  return { run, cancel, download };
}
