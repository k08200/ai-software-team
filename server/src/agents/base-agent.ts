import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentOutput, AgentId } from "../types.js";

export type StreamCallback = (event: {
  type: "thinking" | "text" | "complete";
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}) => void;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6";
const THINKING_BUDGET = parseInt(process.env.THINKING_BUDGET ?? "8000", 10);

export abstract class BaseAgent {
  protected client: Anthropic;
  readonly config: AgentConfig;

  constructor(config: Omit<AgentConfig, "model" | "thinkingBudget"> & { model?: string; thinkingBudget?: number }) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
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
  ): Promise<AgentOutput> {
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

      onStream({
        type: "complete",
        content: fullText,
        inputTokens,
        outputTokens,
      });

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
