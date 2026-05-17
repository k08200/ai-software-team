import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentOutput, AgentId } from "../types.js";
import { getDemoThinking, getDemoResponse, type DemoAgentId } from "../utils/demo-data.js";

export type StreamCallback = (event: {
  type: "thinking" | "text" | "complete";
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}) => void;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6";
const THINKING_BUDGET = parseInt(process.env.THINKING_BUDGET ?? "8000", 10);
const DEMO_MODE = process.env.DEMO_MODE === "true";

// Fake token counts for demo — realistic-looking numbers
const DEMO_TOKEN_MAP: Record<string, [number, number]> = {
  cto:                 [1200,  3200],
  pm:                  [1800,  4100],
  backend:             [2400,  8200],
  frontend:            [2600,  9100],
  qa:                  [3200,  2400],
  security:            [2900,  1800],
  review:              [3100,  2100],
  "Backend Fix Agent": [5800,  7400],
  "Frontend Fix Agent":[6200,  8100],
};

export abstract class BaseAgent {
  protected client: Anthropic;
  readonly config: AgentConfig;

  constructor(config: Omit<AgentConfig, "model" | "thinkingBudget"> & { model?: string; thinkingBudget?: number }) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "demo-key",
    });
    this.config = {
      ...config,
      model: config.model ?? MODEL,
      thinkingBudget: config.thinkingBudget ?? THINKING_BUDGET,
    };
  }

  async run(
    userMessage: string,
    onStream: StreamCallback,
    round?: number,
  ): Promise<AgentOutput> {
    if (DEMO_MODE) {
      return this.runDemo(onStream, round);
    }
    return this.runLive(userMessage, onStream);
  }

  // ── Demo mode: stream pre-written responses with realistic delays ──────
  private async runDemo(onStream: StreamCallback, round?: number): Promise<AgentOutput> {
    const startTime = Date.now();
    // Fix agents have agentId "backend"/"frontend" but we want their named variant
    const agentKey = (
      this.config.agentName === "Backend Fix Agent" ? "Backend Fix Agent" :
      this.config.agentName === "Frontend Fix Agent" ? "Frontend Fix Agent" :
      this.config.agentId ?? this.config.agentName
    ) as DemoAgentId;
    const [inputTokens, outputTokens] = DEMO_TOKEN_MAP[agentKey] ?? [1000, 2000];

    // Stream thinking block
    const thinking = getDemoThinking(agentKey);
    for (const char of thinking) {
      onStream({ type: "thinking", content: char });
      await sleep(2);
    }

    // Stream main response
    const response = getDemoResponse(agentKey, round);
    const CHUNK_SIZE = 8;
    for (let i = 0; i < response.length; i += CHUNK_SIZE) {
      const chunk = response.slice(i, i + CHUNK_SIZE);
      onStream({ type: "text", content: chunk });
      await sleep(12);
    }

    onStream({ type: "complete", content: response, inputTokens, outputTokens });

    return {
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      content: response,
      thinkingContent: thinking,
      tokensUsed: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Live mode: call Claude API ─────────────────────────────────────────
  private async runLive(userMessage: string, onStream: StreamCallback): Promise<AgentOutput> {
    const startTime = Date.now();
    let fullText = "";
    let thinkingText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.messages.stream({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        thinking: {
          type: "enabled",
          budget_tokens: this.config.thinkingBudget,
        },
        system: this.config.systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "thinking_delta") {
            thinkingText += event.delta.thinking;
            onStream({ type: "thinking", content: event.delta.thinking });
          } else if (event.delta.type === "text_delta") {
            fullText += event.delta.text;
            onStream({ type: "text", content: event.delta.text });
          }
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? 0;
        } else if (event.type === "message_start") {
          inputTokens = event.message.usage?.input_tokens ?? 0;
        }
      }

      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;

      onStream({ type: "complete", content: fullText, inputTokens, outputTokens });

      return {
        agentId: this.config.agentId,
        agentName: this.config.agentName,
        content: fullText,
        thinkingContent: thinkingText || undefined,
        tokensUsed: inputTokens + outputTokens,
        inputTokens,
        outputTokens,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[${this.config.agentName}] API error: ${message}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getAgentColor(agentId: AgentId): string {
  const colors: Record<AgentId, string> = {
    cto: "#6366f1",
    pm: "#8b5cf6",
    backend: "#06b6d4",
    frontend: "#10b981",
    qa: "#f59e0b",
    security: "#ef4444",
    review: "#3b82f6",
  };
  return colors[agentId] ?? "#6b7280";
}
